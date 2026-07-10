const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("URL:", url);
console.log("KEY length:", key ? key.length : 0);
if(url && key) {
  const supabase = createClient(url, key);
  supabase.from('strategies').select('*').limit(1).then(res => console.log(res)).catch(console.error);
}
