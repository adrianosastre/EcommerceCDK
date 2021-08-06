import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodeJS from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3n from '@aws-cdk/aws-s3-notifications';
import * as sqs from '@aws-cdk/aws-sqs';
import { DynamoEventSource, SqsDlq } from '@aws-cdk/aws-lambda-event-sources';

export class InvoiceImportApplicationStack extends cdk.Stack {
  readonly urlHandler: lambdaNodeJS.NodejsFunction;
  readonly importHandler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    eventsDdb: dynamodb.Table,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'InvoiceBucket', {
      bucketName: 'invoices-bucket-sastre',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // estados da transação: URL_GENERATED, INVOICE_RECEIVED, INVOICE_PROCESSED, FAIL_NO_INVOICE_NUMBER
    const invoicesDdb = new dynamodb.Table(this, 'InvoicesDdb', {
      tableName: 'InvoicesDdb',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // importante pq estamos interessados no que expirou, parte antiga (novo foi apagado)
    });

    // importar uma nota fiscal:
    this.importHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceImportFunction',
      {
        functionName: 'InvoiceImportFunction',
        entry: 'lambda/invoiceImportFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 256,
        timeout: cdk.Duration.seconds(30),
        environment: {
          INVOICES_DDB: invoicesDdb.tableName,
        },
      }
    );

    bucket.grantReadWrite(this.importHandler);
    invoicesDdb.grantReadWriteData(this.importHandler);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(this.importHandler)
    );

    // gerar a url:
    this.urlHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceUrlFunction',
      {
        functionName: 'InvoiceUrlFunction',
        entry: 'lambda/invoiceUrlFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        environment: {
          BUCKET_NAME: bucket.bucketName,
          INVOICES_DDB: invoicesDdb.tableName,
        },
      }
    );

    bucket.grantReadWrite(this.urlHandler);
    invoicesDdb.grantReadWriteData(this.urlHandler);

    // criar eventos se ocorrer algum problema com a transação:
    const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceEventsFunction',
      {
        functionName: 'InvoiceEventsFunction',
        entry: 'lambda/invoiceEventsFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        environment: {
          EVENTS_DDB: eventsDdb.tableName,
        },
      }
    );

    const invoiceEventsDlq = new sqs.Queue(this, 'InvoiceEventsDlq', {
      queueName: 'invoice-events-dlq',
    });

    invoiceEventsHandler.addEventSource(
      new DynamoEventSource(invoicesDdb, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON, // a partir do primeiro evento, caso já tenha eventos no momento que plugar
        batchSize: 5, // limitar a quantidade de registros para invocar o lambda
        bisectBatchOnError: true, // o que fazer se receber um pacote de eventos? divide o pacote e retenta
        onFailure: new SqsDlq(invoiceEventsDlq),
        retryAttempts: 3,
      })
    );

    eventsDdb.grantWriteData(invoiceEventsHandler);
  }
}
