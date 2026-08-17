require("dotenv").config();
const { Client } = require("pg");

(async () => {
  const client = new Client();
  await client.connect();

  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );

  console.log(result.rows);
  await client.end();
})();
