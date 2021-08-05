const AWS = require("aws-sdk");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const invoicesDdb = process.env.INVOICES_DDB;
const awsRegion = process.env.AWS_REGION;
AWS.config.update({
  region: awsRegion,
});

const s3Client = new AWS.S3();
const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {

  console.log('Números de records: ', event.Records.length);

  //event.Records.forEach((record) => {
    const record = event.Records[0].s3;
    console.log('s3 record: ', record);

    const key = record.object.key;

    const transactionResult = await getInvoiceTransaction(key);
    const invoiceTransaction = transactionResult.Item;

    const params = {
      Key: key,
      Name: record.bucket.name,
    };

    const obj = await s3Client.getObject(params).promise();
    const invoice = JSON.parse(obj.Body.toString('utf-8'));
    console.log('invoice:', invoice);

    if (invoiceTransaction) {
      await updateInvoiceTransaction(key, 'INVOICE_RECEIVED');
    }

    if (invoice.invoiceNumber) {
      const createInvoicePromise = createInvoice(invoice, key);
      const deleteInvoicePromise = s3Client.deleteObject(params);

      await Promise.all([createInvoicePromise, deleteInvoicePromise]);

      if (invoiceTransaction) {
        await updateInvoiceTransaction(key, 'INVOICE_PROCESSED');
      }
    } else {
      await updateInvoiceTransaction(key, 'FAIL_NO_INVOICE_NUMBER');
    }

  //});

  return {};
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
    return ddbClient.udpate(params).promise();
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
    Key: {
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