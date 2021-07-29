import * as cdk from "@aws-cdk/core";
import { ProductsFunctionStack } from "../stacks/productsFunction-stack";
import { EcommerceApiStack } from "../stacks/ecommerceApi-stack";
import { ProductsDdbStack } from '../stacks/productsDdb-stack';

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

    const productsFunctionStack = new ProductsFunctionStack(
      this,
      "ProductsFunctionStack",
      productsDdbStack.table,
      {
        tags: tags,
      }
    );
    productsFunctionStack.addDependency(productsDdbStack);

    const ecommerceApiStack = new EcommerceApiStack(
      this,
      "EcommerceApiStack",
      productsFunctionStack.handler,
      {
        tags: tags,
      }
    );
    ecommerceApiStack.addDependency(productsFunctionStack);

    this.urlOutput = ecommerceApiStack.urlOutput;
  }
}
