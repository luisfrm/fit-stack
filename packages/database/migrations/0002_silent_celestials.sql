CREATE INDEX "idx_payment_subscription_id" ON "payment" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_payment_payment_date" ON "payment" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_payment_org_status" ON "payment" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_ps_organization_id" ON "platform_subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_ps_plan_id" ON "platform_subscription" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_ps_current_period_end" ON "platform_subscription" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "idx_psp_subscription_id" ON "platform_subscription_payment" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_psp_payment_date" ON "platform_subscription_payment" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_psp_subscription_status" ON "platform_subscription_payment" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "idx_subscription_org_member" ON "subscription" USING btree ("organization_id","member_id");