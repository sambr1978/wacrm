import { CompanyForm } from "@/components/companies/company-form";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompanyForm companyId={id} />;
}
