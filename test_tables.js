const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('signals').select('count', { count: 'exact' });
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Signals table works!");
  }
}
test();
