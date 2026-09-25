import { redirect } from "next/navigation";

export default function EditRolePage() {
  redirect("/dashboard?view=users");
}
