import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({service:'aervelys-ops5', phase:'bootstrap', operational:false, databaseConnected:false, simulationRunning:false}, {headers:{'Cache-Control':'no-store'}});
}
