import * as cdk from "@aws-cdk/core";
import { ProductsFunctionStack } from '../stacks/productsFunction-stack';

export class ECommerceStage extends cdk.Stage {
    public readonly urlOutput: cdk.CfnOutput;

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const productsFunctionStack = new ProductsFunctionStack(this, 'ProductsFunctionStack', {
            tags: {
                ['cost']: 'Ecommerce',
                ['team']: 'adrianosastre',
            }
        })
    }
}