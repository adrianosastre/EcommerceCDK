import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodeJS from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3n from '@aws-cdk/aws-s3-notifications';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import * as events from '@aws-cdk/aws-events';
import { DynamoEventSource, SqsDlq } from '@aws-cdk/aws-lambda-event-sources';

export class InvoiceWsApplicationStack extends cdk.Stack {
  readonly handler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    auditBus: events.EventBus,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'InvoiceBucket2', {
      bucketName: 'invoices-bucket2-sastre',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // estados da transação: URL_GENERATED, INVOICE_RECEIVED, INVOICE_PROCESSED, FAIL_NO_INVOICE_NUMBER
    const invoicesDdb = new dynamodb.Table(this, 'InvoicesDdb2', {
      tableName: 'InvoicesDdb2',
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

    // assim que o cliente se conecta ao websocket:
    const connectionHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceConnectionFunction',
      {
        functionName: 'InvoiceConnectionFunction',
        entry: 'lambda/invoiceConnectionFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(3),
      }
    );

    // assim que o cliente se desconecta ao websocket:
    const disconnectionHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceDisconnectionFunction',
      {
        functionName: 'InvoiceDisconnectionFunction',
        entry: 'lambda/invoiceDisconnectionFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(3),
      }
    );

    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'InvoiceWSApi', {
      apiName: 'InvoiceWSApi',
      description: 'This is the invoice websocket api',
      connectRouteOptions: {
        integration: new apigatewayv2_integrations.LambdaWebSocketIntegration({
          handler: connectionHandler,
        }),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2_integrations.LambdaWebSocketIntegration({
          handler: disconnectionHandler,
        }),
      },
      //defaultRouteOptions // poderia ter um lambda para tratar outras rotas
      //routeSelectionExpression: // rota padrão é request.body.action
    });

    const stage = 'prod';
    const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`;

    new apigatewayv2.WebSocketStage(this, 'InvoiceWSApiStage', {
      webSocketApi: webSocketApi,
      stageName: stage,
      autoDeploy: true,
    });

    //pegar a url:
    const getUrlHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceWSUrlFunction',
      {
        functionName: 'InvoiceWSUrlFunction',
        entry: 'lambda/invoiceWSUrlFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(3),
        environment: {
          INVOICES_DDB: invoicesDdb.tableName,
          BUCKET_NAME: bucket.bucketName,
          INVOICE_WSAPI_ENDPOINT: wsApiEndpoint, // lá dentro tem opção de obter essa informação também
        },
      }
    );
    invoicesDdb.grantReadWriteData(getUrlHandler);
    bucket.grantReadWrite(getUrlHandler);

    //importar a url:
    const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceWSImportFunction',
      {
        functionName: 'InvoiceWSImportFunction',
        entry: 'lambda/invoiceWSImportFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(3),
        environment: {
          INVOICES_DDB: invoicesDdb.tableName,
          AUDIT_BUS_NAME: auditBus.eventBusName,
        },
      }
    );
    invoicesDdb.grantReadWriteData(invoiceImportHandler);
    bucket.grantReadWrite(invoiceImportHandler);
    auditBus.grantPutEventsTo(invoiceImportHandler);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(invoiceImportHandler)
    );

    const cancelImportHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceWSCancelImportFunction',
      {
        functionName: 'InvoiceWSCancelImportFunction',
        entry: 'lambda/invoiceWSCancelImportFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(3),
        environment: {
          INVOICES_DDB: invoicesDdb.tableName,
        },
      }
    );
    invoicesDdb.grantReadWriteData(cancelImportHandler);

    // custom policy and apply to lambda:

    const resourcePost = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/POST/@connections/*`;
    const resourceGet = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/GET/@connections/*`;
    const resourceDelete = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/DELETE/@connections/*`;

    const wsApiPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [resourcePost, resourceGet, resourceDelete],
    });

    invoiceImportHandler.addToRolePolicy(wsApiPolicy);
    getUrlHandler.addToRolePolicy(wsApiPolicy);
    cancelImportHandler.addToRolePolicy(wsApiPolicy);

    // Routes:

    webSocketApi.addRoute('getImportUrl', {
      // a chave é o valor do campo request.body.action por padrão
      integration: new apigatewayv2_integrations.LambdaWebSocketIntegration({
        handler: getUrlHandler,
      }),
    });

    webSocketApi.addRoute('cancelImportUrl', {
      // a chave é o valor do campo request.body.action por padrão
      integration: new apigatewayv2_integrations.LambdaWebSocketIntegration({
        handler: cancelImportHandler,
      }),
    });

    const eventsDdb = new dynamodb.Table(this, 'EventsDdb2', {
      tableName: 'EventsDdb2',
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
    });

    // criar eventos se ocorrer algum problema com a transação:
    const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceWsEventsFunction',
      {
        functionName: 'InvoiceWsEventsFunction',
        entry: 'lambda/invoiceWsEventsFunction.js',
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
          AUDIT_BUS_NAME: auditBus.eventBusName,
        },
      }
    );

    auditBus.grantPutEventsTo(invoiceEventsHandler);
    invoiceEventsHandler.addToRolePolicy(wsApiPolicy);

    const invoiceEventsDlq = new sqs.Queue(this, 'InvoiceEventsDlq2', {
      queueName: 'invoice-events-dlq2',
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
