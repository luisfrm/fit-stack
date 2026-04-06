import { relations } from "drizzle-orm/relations";
import { user, account, organization, member, cmsClass, cmsPage, cmsPageBlock, coachAssignment, gymMember, exercise, gymSetting, invitation, membershipPlan, payment, subscription, routineTemplate, staffProfile, routineTemplateItem, session, workoutSession, workoutSessionLog, storeSubscription, fitstackPlan, platformInvoice } from "./schema";

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	members: many(member),
	gymMembers: many(gymMember),
	invitations: many(invitation),
	sessions: many(session),
}));

export const memberRelations = relations(member, ({one}) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id]
	}),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	members: many(member),
	cmsClasses: many(cmsClass),
	cmsPages: many(cmsPage),
	cmsPageBlocks: many(cmsPageBlock),
	coachAssignments: many(coachAssignment),
	gymMembers: many(gymMember),
	exercises: many(exercise),
	gymSettings: many(gymSetting),
	invitations: many(invitation),
	membershipPlans: many(membershipPlan),
	payments: many(payment),
	subscriptions: many(subscription),
	routineTemplates: many(routineTemplate),
	staffProfiles: many(staffProfile),
	workoutSessions: many(workoutSession),
	storeSubscriptions: many(storeSubscription),
	platformInvoices: many(platformInvoice),
}));

export const cmsClassRelations = relations(cmsClass, ({one}) => ({
	organization: one(organization, {
		fields: [cmsClass.organizationId],
		references: [organization.id]
	}),
}));

export const cmsPageRelations = relations(cmsPage, ({one, many}) => ({
	organization: one(organization, {
		fields: [cmsPage.organizationId],
		references: [organization.id]
	}),
	cmsPageBlocks: many(cmsPageBlock),
}));

export const cmsPageBlockRelations = relations(cmsPageBlock, ({one}) => ({
	organization: one(organization, {
		fields: [cmsPageBlock.organizationId],
		references: [organization.id]
	}),
	cmsPage: one(cmsPage, {
		fields: [cmsPageBlock.pageId],
		references: [cmsPage.id]
	}),
}));

export const coachAssignmentRelations = relations(coachAssignment, ({one}) => ({
	organization: one(organization, {
		fields: [coachAssignment.organizationId],
		references: [organization.id]
	}),
	gymMember_coachMemberId: one(gymMember, {
		fields: [coachAssignment.coachMemberId],
		references: [gymMember.id],
		relationName: "coachAssignment_coachMemberId_gymMember_id"
	}),
	gymMember_clientMemberId: one(gymMember, {
		fields: [coachAssignment.clientMemberId],
		references: [gymMember.id],
		relationName: "coachAssignment_clientMemberId_gymMember_id"
	}),
}));

export const gymMemberRelations = relations(gymMember, ({one, many}) => ({
	coachAssignments_coachMemberId: many(coachAssignment, {
		relationName: "coachAssignment_coachMemberId_gymMember_id"
	}),
	coachAssignments_clientMemberId: many(coachAssignment, {
		relationName: "coachAssignment_clientMemberId_gymMember_id"
	}),
	organization: one(organization, {
		fields: [gymMember.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [gymMember.userId],
		references: [user.id]
	}),
	payments: many(payment),
	subscriptions: many(subscription),
	staffProfiles: many(staffProfile),
	workoutSessions: many(workoutSession),
}));

export const exerciseRelations = relations(exercise, ({one, many}) => ({
	organization: one(organization, {
		fields: [exercise.organizationId],
		references: [organization.id]
	}),
	routineTemplateItems: many(routineTemplateItem),
	workoutSessionLogs: many(workoutSessionLog),
}));

export const gymSettingRelations = relations(gymSetting, ({one}) => ({
	organization: one(organization, {
		fields: [gymSetting.organizationId],
		references: [organization.id]
	}),
}));

export const invitationRelations = relations(invitation, ({one}) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id]
	}),
}));

export const membershipPlanRelations = relations(membershipPlan, ({one, many}) => ({
	organization: one(organization, {
		fields: [membershipPlan.organizationId],
		references: [organization.id]
	}),
	subscriptions: many(subscription),
}));

export const paymentRelations = relations(payment, ({one}) => ({
	organization: one(organization, {
		fields: [payment.organizationId],
		references: [organization.id]
	}),
	gymMember: one(gymMember, {
		fields: [payment.memberId],
		references: [gymMember.id]
	}),
	subscription: one(subscription, {
		fields: [payment.subscriptionId],
		references: [subscription.id]
	}),
}));

export const subscriptionRelations = relations(subscription, ({one, many}) => ({
	payments: many(payment),
	organization: one(organization, {
		fields: [subscription.organizationId],
		references: [organization.id]
	}),
	gymMember: one(gymMember, {
		fields: [subscription.memberId],
		references: [gymMember.id]
	}),
	membershipPlan: one(membershipPlan, {
		fields: [subscription.planId],
		references: [membershipPlan.id]
	}),
}));

export const routineTemplateRelations = relations(routineTemplate, ({one, many}) => ({
	organization: one(organization, {
		fields: [routineTemplate.organizationId],
		references: [organization.id]
	}),
	staffProfile: one(staffProfile, {
		fields: [routineTemplate.trainerProfileId],
		references: [staffProfile.id]
	}),
	routineTemplateItems: many(routineTemplateItem),
	workoutSessions: many(workoutSession),
}));

export const staffProfileRelations = relations(staffProfile, ({one, many}) => ({
	routineTemplates: many(routineTemplate),
	organization: one(organization, {
		fields: [staffProfile.organizationId],
		references: [organization.id]
	}),
	gymMember: one(gymMember, {
		fields: [staffProfile.memberId],
		references: [gymMember.id]
	}),
}));

export const routineTemplateItemRelations = relations(routineTemplateItem, ({one}) => ({
	routineTemplate: one(routineTemplate, {
		fields: [routineTemplateItem.routineTemplateId],
		references: [routineTemplate.id]
	}),
	exercise: one(exercise, {
		fields: [routineTemplateItem.exerciseId],
		references: [exercise.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const workoutSessionRelations = relations(workoutSession, ({one, many}) => ({
	organization: one(organization, {
		fields: [workoutSession.organizationId],
		references: [organization.id]
	}),
	gymMember: one(gymMember, {
		fields: [workoutSession.memberId],
		references: [gymMember.id]
	}),
	routineTemplate: one(routineTemplate, {
		fields: [workoutSession.routineTemplateId],
		references: [routineTemplate.id]
	}),
	workoutSessionLogs: many(workoutSessionLog),
}));

export const workoutSessionLogRelations = relations(workoutSessionLog, ({one}) => ({
	workoutSession: one(workoutSession, {
		fields: [workoutSessionLog.sessionId],
		references: [workoutSession.id]
	}),
	exercise: one(exercise, {
		fields: [workoutSessionLog.exerciseId],
		references: [exercise.id]
	}),
}));

export const storeSubscriptionRelations = relations(storeSubscription, ({one}) => ({
	organization: one(organization, {
		fields: [storeSubscription.organizationId],
		references: [organization.id]
	}),
	fitstackPlan: one(fitstackPlan, {
		fields: [storeSubscription.planId],
		references: [fitstackPlan.id]
	}),
}));

export const fitstackPlanRelations = relations(fitstackPlan, ({many}) => ({
	storeSubscriptions: many(storeSubscription),
	platformInvoices: many(platformInvoice),
}));

export const platformInvoiceRelations = relations(platformInvoice, ({one}) => ({
	organization: one(organization, {
		fields: [platformInvoice.organizationId],
		references: [organization.id]
	}),
	fitstackPlan: one(fitstackPlan, {
		fields: [platformInvoice.planId],
		references: [fitstackPlan.id]
	}),
}));