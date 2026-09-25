import { redirect } from "next/navigation";

export default function UserAccessPage() {
  redirect("/dashboard?view=users");
}
