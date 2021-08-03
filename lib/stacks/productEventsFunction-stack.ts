import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodeJS from '@aws-cdk/aws-lambda-nodejs';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sqs from '@aws-cdk/aws-sqs';

export class ProductEventsFunctionStack extends cdk.Stack {
  readonly handler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    eventsDdb: dynamodb.Table,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const dlq = new sqs.Queue(this, 'ProductEventsDlq', {
      queueName: 'product-events-dlq',
      retentionPeriod: cdk.Duration.days(10),
    });

    this.handler = new lambdaNodeJS.NodejsFunction(
      this,
      'ProductEventsFunction',
      {
        functionName: 'ProductEventsFunction',
        entry: 'lambda/productEventsFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        deadLetterQueueEnabled: true,
        deadLetterQueue: dlq,
        environment: {
          EVENTS_DDB: eventsDdb.tableName,
        },
      }
    );

    eventsDdb.grantWriteData(this.handler);
  }
}
