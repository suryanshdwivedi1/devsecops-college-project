# PetClinic DevSecOps Pipeline

> An air-gapped CI/CD pipeline delivering Spring PetClinic to Amazon ECS on EC2 — with no NAT Gateway, no static AWS credentials, and automated security gates on every push.

**Stack:** GitHub Actions · Terraform · Amazon ECS on EC2 · Amazon RDS MySQL · Spring Boot 4.1.1 · Java 17

---

## What this is

A production-grade DevSecOps pipeline built to address four common shortcomings in AWS deployments:

| Problem | Solution |
|---|---|
| Static IAM keys in CI/CD | OIDC federation — short-lived tokens, no secrets to leak |
| NAT Gateway costs ($32+/month) | 9 PrivateLink endpoints + free S3 Gateway — private subnets have no internet route |
| No security testing | SonarCloud (SAST) + Trivy (container CVE scan) gate every push |
| Manual DB schema management | Flyway migrations run inside the container on startup — no SG manipulation needed |

---

## Architecture

```
Git tag push (dev/v*.*.*)
        │
        ▼
┌───────────────────────────────────────────────────────┐
│              GitHub Actions Pipeline                   │
│                                                       │
│  TEST ──► BUILD & SCAN ──► DEPLOY                     │
│  mvn test   docker build    ECS rolling update        │
│  SonarCloud Trivy CRITICAL  OIDC auth                 │
│  quality gate ECR push      wait-for-minutes: 5       │
└───────────────────────────────────────────────────────┘
        │
        ▼ (image pushed to ECR via PrivateLink)
┌──────────────────────────────────────────────────────────────────┐
│ AWS VPC — 10.0.0.0/16                                            │
│                                                                  │
│  Public subnets (10.0.1.0/24, 10.0.2.0/24)                       │
│  └── Application Load Balancer  ← HTTP :80                       │
│                    │                                             │
│  Private subnets (10.0.11.0/24, 10.0.12.0/24) — NO INTERNET ROUTE│
│  ├── ECS Cluster (petclinic-cluster)                             │
│  │   └── EC2 t3.medium × 2 — Spring Boot containers             │
│  ├── RDS MySQL 8.0.46 (petclinic-db)                             │
│  └── VPC Endpoints — ECR, ECS, Logs, Secrets Manager, SSM, S3   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick start

See **[docs/implementation-guide.md](docs/implementation-guide.md)** for the full step-by-step deployment guide.

### Prerequisites

- Terraform >= 1.11.0, AWS CLI >= 2.x, Docker Desktop, JDK 17 + Maven 3.9
- AWS account with admin access
- SonarCloud account (free)

### Deploy in 5 steps

```powershell
# 1. Bootstrap the Terraform state bucket (once per account)
.\scripts\bootstrap_s3.ps1

# 2. Configure your variables
# Edit terraform/terraform.tfvars with your GitHub org, repo IDs, and DB password

# 3. Provision infrastructure (~10 minutes)
cd terraform && terraform apply

# 4. Create the RDS credentials secret
aws secretsmanager create-secret --name "dev/app/rds" --region "us-east-1" `
  --secret-string "{""RDS_USER"":""admin"",""RDS_PASS"":""YourPassword""}"

# 5. Trigger the pipeline
git tag dev/v1.0.0 && git push origin dev/v1.0.0
```

### Tear down

```powershell
.\scripts\teardown.ps1   # drain ECS first
cd terraform && terraform destroy
```

---

## Pipeline

Three sequential jobs triggered by `dev/v*.*.*` or `prod/v*.*.*` tag pushes:

| Job | Steps | Blocks on |
|---|---|---|
| **TEST** | `mvn clean test` + SonarCloud quality gate | Test failure or quality gate |
| **BUILD_AND_PUBLISH** | `mvn package` + `docker build` + Trivy scan + ECR push | Any unpatched CRITICAL CVE |
| **DEPLOY** | Fetch live task def + inject image + ECS rolling update | Service instability > 5 min |

### GitHub Secrets required

| Secret | Value |
|---|---|
| `AWS_ROLE_TO_ASSUME` | `terraform output github_actions_role_arn` |
| `AWS_REGION` | `us-east-1` |
| `REGISTRY` | ECR registry hostname (from `terraform output ecr_repository_url`) |
| `SONAR_TOKEN` | sonarcloud.io → My Account → Security |
| `SONAR_PROJECT_KEY` | sonarcloud.io → Project Information |
| `SONAR_ORGANIZATION` | sonarcloud.io → Organisation |

---

## Infrastructure

All resources are declared in Terraform. Nothing exists outside version control.

| File | Provisions |
|---|---|
| `vpc.tf` | VPC, subnets, IGW, route tables, ALB, all security groups, S3 Gateway Endpoint |
| `vpc_endpoints.tf` | 9 PrivateLink Interface Endpoints (ECR, ECS, Logs, Secrets Manager, SSM) |
| `main.tf` | IAM roles, Launch Template, ASG, ECS Cluster, Capacity Provider, Task Definition, ECS Service |
| `rds.tf` | MySQL 8.0.46 on `db.t3.micro`, encrypted, private subnets only |
| `oidc.tf` | GitHub Actions OIDC provider + IAM role with scoped trust policy |
| `ecr.tf` | ECR repository, KMS encryption, lifecycle policy |
| `variables.tf` | All configurable inputs with validation |

### Key design decisions

- **No NAT Gateway** — private subnet route tables have no `0.0.0.0/0` entry. All AWS API traffic routes through PrivateLink.
- **S3 prefix list egress on ECS SG** — S3 Gateway Endpoint routes to public S3 IPs, not VPC-internal IPs. The ECS security group needs an explicit prefix list egress rule or image pulls time out.
- **t3.medium minimum** — enforced by a Terraform validation block. t3.small (~1913 MiB usable) cannot fit a 2048 MiB Spring Boot task.
- **Flyway inside the container** — no DB migration job, no SG manipulation, no public RDS access. Migrations run at startup using the same VPC path as normal DB traffic.
- **Deployment circuit breaker** — failed deployments stop retrying after ~3 attempts rather than hanging the pipeline indefinitely.

---

## Tech stack

| Layer | Technology |
|---|---|
| CI/CD | GitHub Actions |
| IaC | Terraform >= 1.11.0 |
| Security scanning | SonarCloud (SAST), Trivy v0.36.0 (container CVE) |
| Application | Spring Boot 4.1.1, Java 17, Tomcat 11.0.25 |
| Container registry | Amazon ECR (KMS encrypted) |
| Orchestration | Amazon ECS on EC2, bridge mode, dynamic port mapping |
| Compute | EC2 t3.medium, Amazon Linux 2023 ECS-Optimized, ASG min=1/desired=2/max=3 |
| Database | Amazon RDS MySQL 8.0.46, db.t3.micro, encrypted |
| Networking | ALB, VPC PrivateLink (9 Interface Endpoints + S3 Gateway) |
| Secrets | AWS Secrets Manager, injected at container runtime |
| Access | AWS SSM Session Manager — no SSH, no Bastion |
| Observability | CloudWatch Logs, ECS Container Insights |

---

## Docs

- [Implementation guide](docs/implementation-guide.md) — step-by-step deployment
- [Troubleshooting](docs/troubleshooting.md) — every real issue encountered and how it was fixed
- [Architecture diagram](docs/architecture.drawio) — import into draw.io

---

## Monthly cost estimate

~$60–80/month while running. Run `.\scripts\teardown.ps1` + `terraform destroy` when done.
