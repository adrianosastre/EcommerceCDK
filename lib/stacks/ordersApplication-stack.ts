import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodeJS from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sns from '@aws-cdk/aws-sns';
import * as subs from '@aws-cdk/aws-sns-subscriptions';
import * as sqs from '@aws-cdk/aws-sqs';
import * as events from '@aws-cdk/aws-events';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';

export class OrdersApplicationStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    productsDdb: dynamodb.Table,
    eventsDdb: dynamodb.Table,
    auditBus: events.EventBus,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, 'OrdersDdb', {
      tableName: 'OrdersDdb',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      //readCapacity: 1,
      //writeCapacity: 1,
    });

    /*const readScale = ordersDdb.autoScaleReadCapacity({
      maxCapacity: 4,
      minCapacity: 1,
    });
    readScale.scaleOnUtilization({
      targetUtilizationPercent: 50, // porcentagem que triga o upscale
      scaleInCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 upscale e o seguinte
      scaleOutCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 downscale e o seguinte
    });

    const writeScale = ordersDdb.autoScaleWriteCapacity({
      maxCapacity: 4,
      minCapacity: 1,
    });
    writeScale.scaleOnUtilization({
      targetUtilizationPercent: 50, // porcentagem que triga o upscale
      scaleInCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 upscale e o seguinte
      scaleOutCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 downscale e o seguinte
    });*/

    const ordersTopic = new sns.Topic(this, 'OrderEventsTopic', {
      topicName: 'order-events',
      displayName: 'Order events topic',
    });

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'OrdersFunction',
      {
        functionName: 'OrdersFunction',
        entry: 'lambda/ordersFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        environment: {
          PRODUCTS_DDB: productsDdb.tableName,
          ORDERS_DDB: ordersDdb.tableName,
          ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
          AUDIT_BUS_NAME: auditBus.eventBusName,
        },
      }
    );
    productsDdb.grantReadData(this.ordersHandler);
    ordersDdb.grantReadWriteData(this.ordersHandler);
    ordersTopic.grantPublish(this.ordersHandler);
    auditBus.grantPutEventsTo(this.ordersHandler);

    const orderEventsDlq = new sqs.Queue(this, 'OrderEventsDlq', {
      queueName: 'order-events-dlq',
    });
    const orderEventsQueue = new sqs.Queue(this, 'OrderEvents', {
      queueName: 'order-events',
      deadLetterQueue: {
        queue: orderEventsDlq,
        maxReceiveCount: 3,
      },
    });
    ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue));

    // Exemplo de ligar o tópico a um e-mail:
    /*
    ordersTopic.addSubscription(
      new subs.EmailSubscription('adrianosastre@inatel.br', {
        json: true,
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['ORDER_DELETED'],
          }),
        },
      })
    );*/

    const orderEventsTestQueue = new sqs.Queue(this, 'OrderEventsTest', {
      queueName: 'order-events-test',
    });
    ordersTopic.addSubscription(
      new subs.SqsSubscription(orderEventsTestQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['ORDER_CREATED'],
          }),
        },
      })
    );

    const orderEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'OrderEventsFunction',
      {
        functionName: 'OrderEventsFunction',
        entry: 'lambda/orderEventsFunction.js',
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
    orderEventsHandler.addEventSource(new SqsEventSource(orderEventsQueue));
    eventsDdb.grantWriteData(orderEventsHandler);
    orderEventsQueue.grantConsumeMessages(orderEventsHandler);
  }
}
