import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newOwnerUserId, orgId } = body as {
      newOwnerUserId?: string;
      orgId?: string;
    };

    if (!newOwnerUserId || !orgId) {
      return NextResponse.json(
        { error: "newOwnerUserId and orgId are required" },
        { status: 400 }
      );
    }

    // Auth check using cookie-based client
    const authClient = await createClient();
    const {
      data: { user: caller },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const callerId = caller.id;

    if (newOwnerUserId === callerId) {
      return NextResponse.json(
        { error: "You cannot transfer ownership to yourself" },
        { status: 400 }
      );
    }

    // Use service client for all data operations (bypasses RLS)
    const supabase = await createServiceClient();

    // Verify caller is an owner of the org
    const { data: callerMembership, error: callerMembershipError } =
      await supabase
        .from("user_orgs")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", callerId)
        .is("deleted_at", null)
        .single();

    if (callerMembershipError || !callerMembership) {
      return NextResponse.json(
        { error: "You are not a member of this organisation" },
        { status: 403 }
      );
    }

    if (callerMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the organisation owner can transfer ownership" },
        { status: 403 }
      );
    }

    // Verify new owner is a member of the same org
    const { data: newOwnerMembership, error: newOwnerMembershipError } =
      await supabase
        .from("user_orgs")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", newOwnerUserId)
        .is("deleted_at", null)
        .single();

    if (newOwnerMembershipError || !newOwnerMembership) {
      return NextResponse.json(
        { error: "The specified user is not a member of this organisation" },
        { status: 400 }
      );
    }

    // Fetch org name for emails
    const { data: org, error: orgError } = await supabase
      .from("organisations")
      .select("name")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organisation not found" },
        { status: 404 }
      );
    }

    const orgName = org.name as string;

    // Fetch emails for both parties via auth.admin
    const { data: newOwnerData, error: newOwnerAuthError } =
      await supabase.auth.admin.getUserById(newOwnerUserId);

    if (newOwnerAuthError || !newOwnerData?.user) {
      return NextResponse.json(
        { error: "Could not retrieve new owner user details" },
        { status: 500 }
      );
    }

    const { data: callerData, error: callerAuthError } =
      await supabase.auth.admin.getUserById(callerId);

    if (callerAuthError || !callerData?.user) {
      return NextResponse.json(
        { error: "Could not retrieve caller user details" },
        { status: 500 }
      );
    }

    const newOwnerEmail = newOwnerData.user.email;
    const callerEmail = callerData.user.email;

    if (!newOwnerEmail || !callerEmail) {
      return NextResponse.json(
        { error: "Could not determine email addresses for one or both parties" },
        { status: 500 }
      );
    }

    // Transaction-style updates: promote new owner first, then demote old owner
    const { error: promoteError } = await supabase
      .from("user_orgs")
      .update({ role: "owner", is_admin: true })
      .eq("user_id", newOwnerUserId)
      .eq("org_id", orgId);

    if (promoteError) {
      return NextResponse.json(
        { error: `Failed to promote new owner: ${promoteError.message}` },
        { status: 500 }
      );
    }

    const { error: demoteError } = await supabase
      .from("user_orgs")
      .update({ role: "property_manager", is_admin: true })
      .eq("user_id", callerId)
      .eq("org_id", orgId);

    if (demoteError) {
      // Attempt to roll back the promotion
      await supabase
        .from("user_orgs")
        .update({ role: "owner", is_admin: true })
        .eq("user_id", callerId)
        .eq("org_id", orgId);

      await supabase
        .from("user_orgs")
        .update({ role: newOwnerMembership.role, is_admin: false })
        .eq("user_id", newOwnerUserId)
        .eq("org_id", orgId);

      return NextResponse.json(
        { error: `Failed to update previous owner role: ${demoteError.message}` },
        { status: 500 }
      );
    }

    // Write audit log
    const { error: auditError } = await supabase.from("audit_log").insert({
      org_id: orgId,
      table_name: "user_orgs",
      record_id: newOwnerUserId,
      action: "OWNERSHIP_TRANSFERRED",
      changed_by: callerId,
    });

    if (auditError) {
      // Non-fatal: log but do not fail the request
      console.error("Audit log insert failed:", auditError.message);
    }

    // Send emails via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: "Pleks <noreply@pleks.co.za>",
      to: newOwnerEmail,
      subject: `You are now the owner of ${orgName}`,
      html: `
        <p>Hi,</p>
        <p>Ownership of <strong>${orgName}</strong> has been transferred to you. You are now the owner of this organisation on Pleks.</p>
        <p>You can manage your organisation settings by logging in to <a href="https://pleks.co.za">pleks.co.za</a>.</p>
        <p>The Pleks Team</p>
      `,
    });

    await resend.emails.send({
      from: "Pleks <noreply@pleks.co.za>",
      to: callerEmail,
      subject: `Ownership of ${orgName} has been transferred`,
      html: `
        <p>Hi,</p>
        <p>You have successfully transferred ownership of <strong>${orgName}</strong> to another member of your organisation.</p>
        <p>You remain a member of the organisation with the Property Manager role.</p>
        <p>If you did not initiate this transfer, please contact support immediately.</p>
        <p>The Pleks Team</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
