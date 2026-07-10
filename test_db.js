const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if(!url || !key) {
  console.error("Missing credentials");
  process.exit(1);
}

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('strategies').select('*');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Strategies count:", data.length);
    console.log(data.map(d => d.name));
  }
}
test();
