import type { InitRepository } from '../repositories/init.repository';
import type { Auth } from '../lib/env';

export function createInitService(initRepo: InitRepository) {
  return {
    async checkNeedsInit() {
      const userCount = await initRepo.countUsers();
      return {
        needsInit: userCount === 0,
      };
    },

    async initializeAdmin(auth: Auth, data: { email: string; password: string; name: string }) {
      const { needsInit } = await this.checkNeedsInit();
      if (!needsInit) {
        throw new Error('El sistema ya ha sido inicializado.');
      }

      const newUser = await auth.api.signUpEmail({
        body: {
          email: data.email,
          password: data.password,
          name: data.name,
        },
      });

      if (!newUser || !newUser.user) {
        throw new Error('Fallo al crear el usuario administrador');
      }

      await initRepo.updateUserRole(newUser.user.id, 'admin');

      return {
        id: newUser.user.id,
        email: newUser.user.email,
        name: newUser.user.name,
        role: 'admin',
      };
    },
  };
}

export type InitService = ReturnType<typeof createInitService>;
