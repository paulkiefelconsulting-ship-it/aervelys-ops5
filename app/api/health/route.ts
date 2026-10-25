import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '../../../lib/supabase/config';

export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({
    service: 'aervelys-ops5',
    phase: 'authentication-bootstrap',
    operational: false,
    databaseConnected: false, // No live connectivity check is performed by this endpoint.
    databaseConfigured: isSupabaseConfigured(),
    simulationRunning: false,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
