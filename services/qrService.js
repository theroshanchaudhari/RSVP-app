'use strict';

const QRCode = require('qrcode');

async function generateQRCode(url) {
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
}

async function generateQRCodeBuffer(url) {
  return QRCode.toBuffer(url, { width: 256, margin: 2 });
}

module.exports = { generateQRCode, generateQRCodeBuffer };
