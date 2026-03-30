import { usersRepository } from '@/repositories/users.repository'

export const usersService = {
  async getAll() {
    return usersRepository.findAll()
  },

  async getById(id: string) {
    const user = await usersRepository.findById(id)
    if (!user) throw new Error('User not found')
    return user
  },

  async create(data: { email: string; name: string }) {
    const existing = await usersRepository.findByEmail(data.email)
    if (existing) throw new Error('Email already in use')

    return usersRepository.create({
      ...data,
      id: crypto.randomUUID(),
    })
  },
}
