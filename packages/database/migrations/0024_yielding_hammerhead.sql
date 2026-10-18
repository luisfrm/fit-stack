ALTER TABLE "payment" DROP CONSTRAINT "payment_subscription_id_subscription_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" DROP CONSTRAINT "platform_subscription_payment_subscription_id_platform_subscription_id_fk";
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_subscription_id_platform_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscription"("id") ON DELETE restrict ON UPDATE no action;