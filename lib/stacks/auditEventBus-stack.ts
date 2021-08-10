import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodeJS from '@aws-cdk/aws-lambda-nodejs';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as sqs from '@aws-cdk/aws-sqs';

export class AuditEventBusStack extends cdk.Stack {
  readonly bus: events.EventBus;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.bus = new events.EventBus(this, 'AuditEventBus', {
      eventBusName: 'AuditEventBus',
    });

    // source: app.order
    // detailType: order
    // reason: PRODUCT_NOT_FOUND
    const nonValidOrderRule = new events.Rule(this, 'NonValidOrderRule', {
      ruleName: 'NonValidOrderRule',
      description: 'Rule matching non valid order',
      eventBus: this.bus,
      eventPattern: {
        source: ['app.order'],
        detailType: ['order'],
        detail: {
          // Payload é livre
          reason: ['PRODUCT_NOT_FOUND'],
        },
      },
    });

    const ordersErrorsFunction = new lambdaNodeJS.NodejsFunction(
      this,
      'OrdersErrorsFunction',
      {
        functionName: 'OrdersErrorsFunction',
        entry: 'lambda/ordersErrorsFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
      }
    );

    nonValidOrderRule.addTarget(
      new targets.LambdaFunction(ordersErrorsFunction)
    );

    // source: app.invoice
    // detailType: invoice
    // reason: FAIL_NO_INVOICE_NUMBER
    const nonValidInvoiceRule = new events.Rule(this, 'NonValidInvoiceRule', {
      ruleName: 'NonValidInvoiceRule',
      description: 'Rule matching non valid invoice',
      eventBus: this.bus,
      eventPattern: {
        source: ['app.invoice'],
        detailType: ['invoice'],
        detail: {
          // Payload é livre
          errorDetail: ['FAIL_NO_INVOICE_NUMBER'],
        },
      },
    });

    const invoiceErrorsFunction = new lambdaNodeJS.NodejsFunction(
      this,
      'InvoiceErrorsFunction',
      {
        functionName: 'InvoiceErrorsFunction',
        entry: 'lambda/invoiceErrorsFunction.js',
        handler: 'handler',
        bundling: {
          minify: false,
          sourceMap: true,
        },
        tracing: lambda.Tracing.ACTIVE,
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
      }
    );

    nonValidInvoiceRule.addTarget(
      new targets.LambdaFunction(invoiceErrorsFunction)
    );

    // source: app.invoice
    // detailType: invoice
    // reason: TIMEOUT
    const timeoutImportInvoiceRule = new events.Rule(
      this,
      'TimeoutImportInvoiceRule',
      {
        ruleName: 'TimeoutImportInvoiceRule',
        description: 'Rule matching timeout import',
        eventBus: this.bus,
        eventPattern: {
          source: ['app.invoice'],
          detailType: ['invoice'],
          detail: {
            // Payload é livre
            errorDetail: ['TIMEOUT'],
          },
        },
      }
    );

    timeoutImportInvoiceRule.addTarget(
      new targets.SqsQueue(
        new sqs.Queue(this, 'InvoiceImportTimeoutQueue', {
          queueName: 'invoice-import-timeout-queue',
        })
      )
    );

    // guardando eventos de um source específico:
    this.bus.archive('BusArchive', {
      eventPattern: {
        source: ['app.order'],
      },
      archiveName: 'auditEvents',
      retention: cdk.Duration.days(10),
    });
  }
}
