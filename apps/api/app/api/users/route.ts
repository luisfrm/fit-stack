import { NextRequest, NextResponse } from 'next/server'
import { usersService } from '@/services/users.service'

export async function GET() {
  const users = await usersService.getAll()
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const user = await usersService.create(body)
  return NextResponse.json(user, { status: 201 })
}
