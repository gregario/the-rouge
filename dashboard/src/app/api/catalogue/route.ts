import { NextResponse } from 'next/server'
import { catalogue } from '@/data/catalogue'

export async function GET() {
  return NextResponse.json(catalogue)
}
