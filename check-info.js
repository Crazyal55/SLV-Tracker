const axios = require('axios');

const ALPHA_VANTAGE_KEY = 'R1PU7I83OJE9GSEI';
const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SLV&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;

axios.get(url)
  .then(response => {
    console.log('Full response:');
    console.log(JSON.stringify(response.data, null, 2));
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
