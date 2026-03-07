import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const showDeleted = request.nextUrl.searchParams.get('deleted') === 'true';

  try {
    let query = supabase.from('bluepill_stocks').select('*');

    if (!showDeleted) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query.order('ath_decline_pct', { ascending: false });

    if (error) {
      // Table might not exist yet
      if (error.code === 'PGRST205' || error.message?.includes('bluepill_stocks')) {
        return NextResponse.json([]);
      }
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
