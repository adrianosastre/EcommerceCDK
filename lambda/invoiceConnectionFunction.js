const AWS = require("aws-sdk");
const uuid = require("uuid");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const awsRegion = process.env.AWS_REGION;
AWS.config.update({
  region: awsRegion,
});

exports.handler = async function (event, context) {

  const method = event.httpMethod;
  console.log(event);

  return {};
}