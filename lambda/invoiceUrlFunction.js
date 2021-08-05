const AWS = require("aws-sdk");
const uuid = require("uuid");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const bucketName = process.env.BUCKET_NAME;
const invoicesDdb = process.env.INVOICES_DDB;
const awsRegion = process.env.AWS_REGION;
AWS.config.update({
  region: awsRegion,
});

const s3Client = new AWS.S3();
const ddbClient = new AWS.DynamoDB.DocumentClient();


exports.handler = async function (event, context) {

  const method = event.httpMethod;
  console.log(event);
  const apiRequestId = event.requestContext.requestId;
  const lambdaRequestId = context.awsRequestId;
  console.log(`API Gateway RequestId: ${apiRequestId}​ - Lambda RequestId: ${lambdaRequestId}​​`);

  if (event.resource === "/invoices") {
    if (method === 'POST') { // criar a URL
      const key = uuid.v4();
      const expires = 60 * 5; // 5 minutos

      const params = {
        Bucket: bucketName,
        Key: key,
        Expires: expires,
      };
      const signedUrl = await s3Client.getSignedUrlPromise('putObject', params);

      await createInvoiceTransaction(key, lambdaRequestId, expires);

      return {
        statusCode: 200,
        body: JSON.stringify({
          url: signedUrl,
          expiresIn: expires,
          transactionId: key,
        })
      };
    } else if (method === 'GET') {
      if (event.queryStringParameters && event.queryStringParameters.transactionId) {
        const transactionId = event.queryStringParameters.transactionId;
        const data = await getInvoiceTransaction(transactionId);
        if (data.Item) {
          const data = await getInvoiceTransaction(key);
          return {
            statusCode: 200,
            body: JSON.stringify({
              transactionId: transactionId,
              transactionStatus: data.Item.transactionStatus,
              timestamp: data.Item.timestamp,
            }),
          }

        } else {
          return {
            statusCode: 404,
            body: JSON.stringify(`Transaction id ${transactionId} not found`),
          }
        }
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify('Bad request'),
  };

}

function getInvoiceTransaction(key) {
  const params = {
    TableName: invoicesDdb,
    Key: {
      pk: '#transaction',
      sk: key,
    },
  };

  try {
    return ddbClient.get(params).promise();
  } catch (err) {
    return err;
  }
}

function createInvoiceTransaction(key, requestId, expiresIn, /* , username */ ) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 60); // 1 hora

  const params = {
    TableName: invoicesDdb,
    Item: {
      pk: '#transaction',
      sk: key,
      ttl: ttl,
      requestId: requestId,
      transactionStatus: 'URL_GENERATED',
      timestamp: timestamp,
      expiresIn: expiresIn,
    },
  };

  try {
    return ddbClient.put(params).promise();
  } catch (err) {
    return err;
  }
}