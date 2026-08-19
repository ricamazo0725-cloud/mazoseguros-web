import { supabase } from "@/lib/supabaseClient";

export async function submitQuoteRequest(request) {
  const { error } = await supabase.from("quote_requests").insert(request);
  if (error) throw error;
}

export async function getQuoteRequests() {
  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function markQuoteRequestHandled(id, handled) {
  const { error } = await supabase.from("quote_requests").update({ handled }).eq("id", id);
  if (error) throw error;
}
