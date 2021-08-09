const AWS = require("aws-sdk");
const uuid = require("uuid");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const awsRegion = process.env.AWS_REGION;
AWS.config.update({
  region: awsRegion,
});

const invoicesDdb = process.env.INVOICES_DDB;

const s3Client = new AWS.S3();
const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {

  console.log(event);
  console.log('Números de records: ', event.Records.length);

  const record = event.Records[0].s3;
  console.log('s3 record: ', record);

  const key = record.object.key;

  const transactionResult = await getInvoiceTransaction(key);
  const invoiceTransaction = transactionResult.Item;

  const params = {
    Key: key,
    Bucket: record.bucket.name,
  };

  const obj = await s3Client.getObject(params).promise();
  const invoice = JSON.parse(obj.Body.toString('utf-8'));
  console.log('invoice:', invoice);

  let apiGwManagementApi;

  if (invoiceTransaction) {

    // responder ao websocket api que recebeu o arquivo:
    apiGwManagementApi = new AWS.ApiGatewayManagementApi({
      apiVersion: "2018-11-29",
      endpoint: invoiceTransaction.endpoint,
    });

    await Promise.all([
      sendInvoiceStatus(apiGwManagementApi, invoiceTransaction, 'INVOICE_RECEIVED'),
      updateInvoiceTransaction(key, 'INVOICE_RECEIVED')
    ]);
  }

  if (invoice.invoiceNumber) {
    const createInvoicePromise = createInvoice(invoice, key);
    const deleteInvoicePromise = s3Client.deleteObject(params);

    await Promise.all([createInvoicePromise, deleteInvoicePromise]);

    if (invoiceTransaction) {
      await Promise.all([
        sendInvoiceStatus(apiGwManagementApi, invoiceTransaction, 'INVOICE_PROCESSED'),
        updateInvoiceTransaction(key, 'INVOICE_PROCESSED')
      ]);
    }
  } else {
    if (invoiceTransaction) {
      await Promise.all([
        sendInvoiceStatus(apiGwManagementApi, invoiceTransaction, 'FAIL_NO_INVOICE_NUMBER'),
        updateInvoiceTransaction(key, 'FAIL_NO_INVOICE_NUMBER')
      ]);

      await disconnectClient(apiGwManagementApi, invoiceTransaction);
    }
  }

  return {};
}

function disconnectClient(apiGwManagementApi, invoiceTransaction) {
  return apiGwManagementApi.deleteConnection({
    ConnectionId: invoiceTransaction.connectionId,
  }).promise();
}

function sendInvoiceStatus(apiGwManagementApi, invoiceTransaction, status) {
  const postData = JSON.stringify({
    transactionId: invoiceTransaction.sk,
    status: status,
  });

  return apiGwManagementApi.postToConnection({
    ConnectionId: invoiceTransaction.connectionId,
    Data: postData,
  }).promise();
}

function updateInvoiceTransaction(key, status) {
  const params = {
    TableName: invoicesDdb,
    Key: {
      pk: '#transaction',
      sk: key,
    },
    UpdateExpression: 'set transactionStatus = :s',
    ExpressionAttributeValues: {
      ':s': status,
    },
  };

  try {
    return ddbClient.update(params).promise();
  } catch (err) {
    return err;
  }
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

function createInvoice(invoice, key) {
  const params = {
    TableName: invoicesDdb,
    Item: {
      pk: `#invoice${invoice.customerName}`,
      sk: invoice.invoiceNumber,
      totalValue: invoice.totalValue,
      productId: invoice.productId,
      quantity: invoice.quantity,
      transactionId: key,
      ttl: 0,
      createdAt: Date.now(),
    },
  };

  try {
    return ddbClient.put(params).promise();
  } catch (err) {
    return err;
  }
}