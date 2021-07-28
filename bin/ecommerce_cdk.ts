#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { PipelineStack } from '../lib/pipeline/pipeline-stack';

const app = new cdk.App();

/*const branch = 'DEV';

if (branch == 'DEV') {
  account:
  region:
  debug:
}
*/

new PipelineStack(app, 'PipelineStack', {
  env: {
    account: '685730834918',
    region: 'us-east-1',
  },
  tags: {
    ['cost']: 'Ecommerce',
    ['team']: 'adrianosastre',
  }
});

app.synth();
