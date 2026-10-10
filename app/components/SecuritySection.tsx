import Divider from "./Divider";
import {
  EncryptionIcon,
  RbacIcon,
  AuditLogIcon,
  MachineIdentityIcon,
  EnvironmentIcon,
  RotationIcon,
} from "./SecurityIcons";

const concepts = [
  {
    title: "Encryption",
    desc: "AES-256-GCM encryption at rest, HTTPS in transit.",
    icon: EncryptionIcon,
  },
  {
    title: "RBAC",
    desc: "Owner, admin, member, and viewer roles, plus per-environment grants.",
    icon: RbacIcon,
  },
  {
    title: "Audit Logs",
    desc: "Reads, changes, and denied attempts, attributed and timestamped.",
    icon: AuditLogIcon,
  },
  {
    title: "Short-lived sessions",
    desc: "CLI access tokens last one hour, with rotating refresh tokens.",
    icon: MachineIdentityIcon,
  },
  {
    title: "Environment Isolation",
    desc: "Members and viewers only reach the environments they are granted.",
    icon: EnvironmentIcon,
  },
  {
    title: "Version history",
    desc: "Every change is kept, and any earlier value can be restored.",
    icon: RotationIcon,
  },
];

export default function SecuritySection() {
  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-lg">
          <h2 className="text-balance text-[32px] font-semibold tracking-tight sm:text-[40px]">
            Built for secrets.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 border-t border-border sm:grid-cols-3">
          {concepts.map((c, i) => {
            const col = i % 3;
            return (
              <div
                key={c.title}
                className={`border-b border-border px-6 py-7 ${
                  col !== 2 ? "sm:border-r" : ""
                } ${col === 0 ? "sm:pl-0" : ""}`}
              >
                <c.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-3 text-[15px] font-medium">{c.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {c.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
