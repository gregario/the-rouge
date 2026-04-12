import { NextResponse } from 'next/server'
import { platform } from '@/data/platform'

export async function GET() {
  return NextResponse.json(platform)
}
