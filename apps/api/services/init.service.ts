import { auth } from '@/config/auth';
import { initRepository } from '../repositories/init.repository';

export const initService = {
  /**
   * Check if initialization is needed by counting existing users.
   */
  async checkNeedsInit() {
    const userCount = await initRepository.countUsers();
    return {
      needsInit: userCount === 0,
    };
  },

  /**
   * Orchestrates the creation of the first Admin.
   * Only allows activation if the system is clean.
   */
  async initializeAdmin(data: { email: string; password: string; name: string }) {
    // 1. Double check if users exist
    const { needsInit } = await this.checkNeedsInit();
    if (!needsInit) {
      throw new Error('El sistema ya ha sido inicializado.');
    }

    // 2. Create the user via Better Auth Server-side API
    // Note: 'role' is ignored if it's in the input but handled by config,
    // so we handle it manually afterwards via repository.
    const newUser = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      }
    });

    if (!newUser || !newUser.user) {
      throw new Error('Fallo al crear el usuario administrador');
    }

    // 3. Set the 'admin' role directly in the DB
    await initRepository.updateUserRole(newUser.user.id, 'admin');

    return {
      id: newUser.user.id,
      email: newUser.user.email,
      name: newUser.user.name,
      role: 'admin'
    };
  }
};
