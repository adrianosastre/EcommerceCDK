import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodeJS from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sns from '@aws-cdk/aws-sns';
import * as subs from '@aws-cdk/aws-sns-subscriptions';
import * as sqs from '@aws-cdk/aws-sqs';

export class OrdersApplicationStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    productsDdb: dynamodb.Table,
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
        },
      }
    );
    productsDdb.grantReadData(this.ordersHandler);
    ordersDdb.grantReadWriteData(this.ordersHandler);
    ordersTopic.grantPublish(this.ordersHandler);

    const orderEventsDlq = new sqs.Queue(this, 'OrderEventsDlq', {
      queueName: 'order-events-dlq',
    });
    const orderEvents = new sqs.Queue(this, 'OrderEvents', {
      queueName: 'order-events',
      deadLetterQueue: {
        queue: orderEventsDlq,
        maxReceiveCount: 3,
      },
    });
    ordersTopic.addSubscription(new subs.SqsSubscription(orderEvents));

    // Exemplo de ligar o tópico a um e-mail:
    ordersTopic.addSubscription(
      new subs.EmailSubscription('adrianosastre@inatel.br', {
        json: true,
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['ORDER_DELETED'],
          }),
        },
      })
    );

    const orderEventsTest = new sqs.Queue(this, 'OrderEventsTest', {
      queueName: 'order-events-test',
    });
    ordersTopic.addSubscription(
      new subs.SqsSubscription(orderEventsTest, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['ORDER_CREATED'],
          }),
        },
      })
    );
  }
}
