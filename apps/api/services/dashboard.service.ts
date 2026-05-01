import { membersRepository } from '../repositories/members.repository'
import { plansRepository } from '../repositories/plans.repository'
import { subscriptionsRepository } from '../repositories/subscriptions.repository'
import { settingsService } from './settings.service'

export const dashboardService = {
  async getDashboardSummary(organizationId: string) {
    const dateManager = await settingsService.getDateManager(organizationId)
    const utcNow = new Date()
    
    const [
      activeMembers,
      membersByRole,
      membershipsSummary,
      recentSubscriptions
    ] = await Promise.all([
      membersRepository.countActive(organizationId, utcNow),
      membersRepository.countByRole(organizationId),
      plansRepository.getSummary(organizationId, dateManager, utcNow),
      subscriptionsRepository.findRecent(organizationId, 5)
    ])

    return {
      activeMembers,
      membersByRole,
      membershipsSummary,
      recentSubscriptions: recentSubscriptions.map((r: any) => ({
        id: r.id,
        name: `${r.memberName} ${r.memberLastName}`,
        createdAt: r.createdAt.toISOString()
      }))
    }
  }
}
