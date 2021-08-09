const AWS = require("aws-sdk");
const uuid = require("uuid");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const awsRegion = process.env.AWS_REGION;
AWS.config.update({
  region: awsRegion,
});

const invoicesDdb = process.env.INVOICES_DDB;
const bucketName = process.env.BUCKET_NAME;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT;

const s3 = new AWS.S3();
const ddbClient = new AWS.DynamoDB.DocumentClient();
const apiGwManagementApi = new AWS.ApiGatewayManagementApi({
  apiVersion: "2018-11-29",
  endpoint: invoiceWsApiEndpoint,
});

exports.handler = async function (event, context) {

  console.log(event);

  const connectionId = event.requestContext.connectionId; // id da conexão do web socket, mais importante para chegar de volta no cliente conectado ao websocket!
  const lambdaRequestId = context.awsRequestId;

  console.log(`ConnectionId: ${connectionId} - Lambda RequestId: ${lambdaRequestId}​​`);

  const key = uuid.v4();
  const expiresIn = 60 * 5; // 5 minutos

  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expiresIn,
  };
  const signedUrl = await s3Client.getSignedUrlPromise('putObject', params);

  await createInvoiceTransaction(key, lambdaRequestId, expiresIn, connectionId, invoiceWsApiEndpoint);

  // responder ao cliente que está conectado ao web socket api:

  const postData = JSON.stringify({
    url: signedUrl,
    expiresIn: expiresIn,
    transactionId: key,
  });
  await apiGwManagementApi.postToConnection({
    ConnectionId: connectionId,
    Data: postData,
  });

  // a resposta aqui não vai para o cliente no retorno da função lambda porque
  // essa função foi trigada por um websocket api
  return {};
}

function createInvoiceTransaction(key, requestId, expiresIn, connectionId, invoiceWsApiEndpoint) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 2); // 2 minutos

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
      connectionId: connectionId,
      endpoint: invoiceWsApiEndpoint,
    },
  };

  try {
    return ddbClient.put(params).promise();
  } catch (err) {
    return err;
  }
}