import { redirect } from "next/navigation";

export default function NewRolePage() {
  redirect("/dashboard?view=users");
}
