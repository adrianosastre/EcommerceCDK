import * as cdk from "@aws-cdk/core";
import { ProductEventsFunctionStack } from './../stacks/productEventsFunction-stack';
import { EventsDdbStack } from './../stacks/eventsDdb-stack';
import { ProductsFunctionStack } from "../stacks/productsFunction-stack";
import { EcommerceApiStack } from "../stacks/ecommerceApi-stack";
import { ProductsDdbStack } from '../stacks/productsDdb-stack';
import { OrdersApplicationStack } from '../stacks/ordersApplication-stack';

export class ECommerceStage extends cdk.Stage {
  public readonly urlOutput: cdk.CfnOutput;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tags = {
      ["cost"]: "Ecommerce",
      ["team"]: "adrianosastre",
    };

    const productsDdbStack = new ProductsDdbStack(
      this,
      "ProductsDdbStack",
      {
        tags: tags,
      }
    );

    const eventsDdbStack = new EventsDdbStack(
      this,
      "EventsDdbStack",
      {
        tags: tags,
      }
    );

    const productEventsFunctionStack = new ProductEventsFunctionStack(
      this,
      "ProductEventsFunctionStack",
      eventsDdbStack.table,
      {
        tags: tags,
      }
    );
    productEventsFunctionStack.addDependency(eventsDdbStack);

    const productsFunctionStack = new ProductsFunctionStack(
      this,
      "ProductsFunctionStack",
      productsDdbStack.table,
      productEventsFunctionStack.handler,
      {
        tags: tags,
      }
    );
    productsFunctionStack.addDependency(productsDdbStack);
    productsFunctionStack.addDependency(productEventsFunctionStack);

    const ordersApplicationStack = new OrdersApplicationStack(
      this,
      "OrdersApplicationStack",
      productsDdbStack.table,
      eventsDdbStack.table,
      {
        tags: tags,
      }
    );
    ordersApplicationStack.addDependency(productsDdbStack);
    ordersApplicationStack.addDependency(eventsDdbStack);

    const ecommerceApiStack = new EcommerceApiStack(
      this,
      "EcommerceApiStack",
      productsFunctionStack.handler,
      ordersApplicationStack.ordersHandler,
      {
        tags: tags,
      }
    );
    ecommerceApiStack.addDependency(productsFunctionStack);
    ecommerceApiStack.addDependency(ordersApplicationStack);

    this.urlOutput = ecommerceApiStack.urlOutput;
  }
}
