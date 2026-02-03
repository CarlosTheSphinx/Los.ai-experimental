import { faker } from "@faker-js/faker";
import bcrypt from "bcrypt";
import { db } from "../db";
import { users, savedQuotes, projects, projectStages, projectTasks } from "../../shared/schema";
import { eq } from "drizzle-orm";

// Production guard
if (process.env.NODE_ENV === "production") {
  console.error("❌ Seeding is disabled in production");
  process.exit(1);
}

// Use deterministic seed for reproducibility
faker.seed(12345);

// Borrower lifecycle stages
const BORROWER_STAGES = [
  { key: "registered_only", description: "Registered but never started application" },
  { key: "started_app_10", description: "Started application, 10% complete" },
  { key: "started_app_50", description: "Started application, 50% complete" },
  { key: "submitted_pending", description: "Application submitted, pending review" },
  { key: "under_review", description: "Application under review" },
  { key: "approved_awaiting_docs", description: "Approved, awaiting documents" },
  { key: "docs_submitted", description: "Documents submitted for review" },
  { key: "in_underwriting", description: "In underwriting process" },
  { key: "conditional_approval", description: "Conditional approval issued" },
  { key: "clear_to_close", description: "Clear to close" },
  { key: "funded", description: "Loan funded" },
  { key: "declined_credit", description: "Declined - credit issues" },
  { key: "declined_dti", description: "Declined - DTI too high" },
  { key: "needs_more_info", description: "Needs additional information" },
  { key: "withdrawn", description: "Application withdrawn" },
  { key: "on_hold", description: "Application on hold" },
  { key: "duplicate_test", description: "Duplicate/test edge case" },
  { key: "expired", description: "Application expired" },
  { key: "resubmitted", description: "Previously declined, resubmitted" },
  { key: "referred_partner", description: "Referred by partner" },
];

// Project stage definitions
const PROJECT_STAGES_TEMPLATE = [
  { stageName: "Documentation", stageKey: "documentation", stageOrder: 1 },
  { stageName: "Application Review", stageKey: "application_review", stageOrder: 2 },
  { stageName: "Underwriting", stageKey: "underwriting", stageOrder: 3 },
  { stageName: "Appraisal", stageKey: "appraisal", stageOrder: 4 },
  { stageName: "Title & Insurance", stageKey: "title_insurance", stageOrder: 5 },
  { stageName: "Conditional Approval", stageKey: "conditional_approval", stageOrder: 6 },
  { stageName: "Clear to Close", stageKey: "clear_to_close", stageOrder: 7 },
  { stageName: "Closing", stageKey: "closing", stageOrder: 8 },
  { stageName: "Funding", stageKey: "funding", stageOrder: 9 },
];

// Get deal stage and project status based on borrower stage
function getStageInfo(stageKey: string) {
  const stageMap: Record<string, { dealStage: string; projectStatus: string; currentStage: string; progress: number }> = {
    registered_only: { dealStage: "initial-review", projectStatus: "active", currentStage: "documentation", progress: 0 },
    started_app_10: { dealStage: "initial-review", projectStatus: "active", currentStage: "documentation", progress: 10 },
    started_app_50: { dealStage: "initial-review", projectStatus: "active", currentStage: "documentation", progress: 30 },
    submitted_pending: { dealStage: "under-review", projectStatus: "active", currentStage: "application_review", progress: 35 },
    under_review: { dealStage: "under-review", projectStatus: "active", currentStage: "application_review", progress: 40 },
    approved_awaiting_docs: { dealStage: "approved", projectStatus: "active", currentStage: "documentation", progress: 50 },
    docs_submitted: { dealStage: "approved", projectStatus: "active", currentStage: "underwriting", progress: 55 },
    in_underwriting: { dealStage: "approved", projectStatus: "active", currentStage: "underwriting", progress: 60 },
    conditional_approval: { dealStage: "approved", projectStatus: "active", currentStage: "conditional_approval", progress: 75 },
    clear_to_close: { dealStage: "approved", projectStatus: "active", currentStage: "clear_to_close", progress: 85 },
    funded: { dealStage: "funded", projectStatus: "funded", currentStage: "funding", progress: 100 },
    declined_credit: { dealStage: "declined", projectStatus: "cancelled", currentStage: "application_review", progress: 40 },
    declined_dti: { dealStage: "declined", projectStatus: "cancelled", currentStage: "underwriting", progress: 55 },
    needs_more_info: { dealStage: "initial-review", projectStatus: "on_hold", currentStage: "documentation", progress: 25 },
    withdrawn: { dealStage: "withdrawn", projectStatus: "cancelled", currentStage: "documentation", progress: 20 },
    on_hold: { dealStage: "on-hold", projectStatus: "on_hold", currentStage: "underwriting", progress: 50 },
    duplicate_test: { dealStage: "initial-review", projectStatus: "active", currentStage: "documentation", progress: 5 },
    expired: { dealStage: "expired", projectStatus: "cancelled", currentStage: "documentation", progress: 15 },
    resubmitted: { dealStage: "under-review", projectStatus: "active", currentStage: "application_review", progress: 45 },
    referred_partner: { dealStage: "initial-review", projectStatus: "active", currentStage: "documentation", progress: 20 },
  };
  return stageMap[stageKey] || stageMap.registered_only;
}

// Generate a realistic property address
function generatePropertyAddress() {
  const streetNumber = faker.number.int({ min: 100, max: 9999 });
  const streetName = faker.location.street();
  const city = faker.location.city();
  const state = faker.location.state({ abbreviated: true });
  const zip = faker.location.zipCode();
  return `${streetNumber} ${streetName}, ${city}, ${state} ${zip}`;
}

// Generate loan data based on loan type
function generateLoanData(loanType: string) {
  if (loanType === "dscr") {
    return {
      loanProductType: "dscr",
      loanAmount: faker.number.int({ min: 150000, max: 2000000 }),
      propertyValue: faker.number.int({ min: 200000, max: 2500000 }),
      ltv: faker.helpers.arrayElement(["60", "65", "70", "75", "80"]),
      loanType: faker.helpers.arrayElement(["30 Yr Fixed", "5/1 ARM", "7/1 ARM"]),
      interestOnly: faker.helpers.arrayElement(["Yes", "No"]),
      loanPurpose: faker.helpers.arrayElement(["Purchase", "Refinance", "Cash-Out"]),
      propertyType: faker.helpers.arrayElement(["Single Family", "2-4 Unit", "Condo", "Townhouse"]),
      grossMonthlyRent: faker.number.int({ min: 1500, max: 8000 }),
      annualTaxes: faker.number.int({ min: 2000, max: 15000 }),
      annualInsurance: faker.number.int({ min: 1000, max: 5000 }),
      dscr: faker.helpers.arrayElement(["1.00", "1.10", "1.20", "1.25", "1.30"]),
      ficoScore: faker.helpers.arrayElement(["660-679", "680-699", "700-719", "720-739", "740+"]),
      prepaymentPenalty: faker.helpers.arrayElement(["None", "1 Year", "2 Year", "3 Year"]),
    };
  } else {
    return {
      loanProductType: "rtl",
      loanType: faker.helpers.arrayElement(["light_rehab", "heavy_rehab", "bridge_no_rehab", "guc"]),
      purpose: faker.helpers.arrayElement(["purchase", "refi", "cash_out"]),
      loanAmount: faker.number.int({ min: 100000, max: 3000000 }),
      propertyUnits: faker.number.int({ min: 1, max: 4 }),
      propertyType: faker.helpers.arrayElement(["sfr_1_4", "condo", "multifamily"]),
      asIsValue: faker.number.int({ min: 150000, max: 2000000 }),
      arv: faker.number.int({ min: 200000, max: 3000000 }),
      rehabBudget: faker.number.int({ min: 20000, max: 500000 }),
      experienceTier: faker.helpers.arrayElement(["no_experience", "experienced", "institutional"]),
      completedProjects: faker.number.int({ min: 0, max: 50 }),
      fico: faker.number.int({ min: 660, max: 800 }),
      borrowingEntityType: faker.helpers.arrayElement(["llc", "corporation", "lp"]),
    };
  }
}

async function seedTestBorrowers(count: number = 20) {
  console.log("🌱 Starting test data seeding...");
  console.log(`Creating ${count} test borrowers with related data...\n`);

  // First, clean up any existing test data
  console.log("🧹 Cleaning up existing test users...");
  const existingTestUsers = await db.select().from(users).where(eq(users.isTestUser, true));
  
  for (const testUser of existingTestUsers) {
    // Delete related projects first (cascade will handle stages, tasks, activity)
    await db.delete(projects).where(eq(projects.userId, testUser.id));
    // Delete related quotes
    await db.delete(savedQuotes).where(eq(savedQuotes.userId, testUser.id));
    // Delete user
    await db.delete(users).where(eq(users.id, testUser.id));
  }
  console.log(`Cleaned up ${existingTestUsers.length} existing test users\n`);

  const createdUsers: Array<{ user: any; stage: typeof BORROWER_STAGES[0] }> = [];

  for (let i = 0; i < count; i++) {
    const stage = BORROWER_STAGES[i % BORROWER_STAGES.length];
    const stageInfo = getStageInfo(stage.key);
    
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = `test.borrower.${i + 1}@sphinxtest.com`;
    const passwordHash = await bcrypt.hash("TestPass123!", 10);

    console.log(`📝 Creating borrower ${i + 1}/${count}: ${firstName} ${lastName} (${stage.description})`);

    // Create user
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      fullName: `${firstName} ${lastName}`,
      phone: faker.phone.number(),
      companyName: stage.key === "referred_partner" ? faker.company.name() : null,
      role: "user",
      userType: "borrower",
      emailVerified: stage.key !== "registered_only",
      isActive: !["declined_credit", "declined_dti", "withdrawn", "expired"].includes(stage.key),
      onboardingCompleted: true, // Borrowers don't need onboarding
      isTestUser: true,
    }).returning();

    createdUsers.push({ user: newUser, stage });

    // Create saved quote (deal) for users who have started applications
    if (stage.key !== "registered_only") {
      const loanType = faker.helpers.arrayElement(["dscr", "rtl"]);
      const loanData = generateLoanData(loanType);
      const propertyAddress = generatePropertyAddress();
      const loanAmount = loanData.loanAmount || faker.number.int({ min: 150000, max: 2000000 });
      const interestRate = faker.number.float({ min: 6.5, max: 12.5, fractionDigits: 2 }).toString();

      const [quote] = await db.insert(savedQuotes).values({
        userId: newUser.id,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: email,
        customerPhone: faker.phone.number(),
        propertyAddress,
        loanData,
        interestRate,
        pointsCharged: faker.number.float({ min: 1, max: 3, fractionDigits: 2 }),
        pointsAmount: loanAmount * (faker.number.float({ min: 0.01, max: 0.03, fractionDigits: 2 })),
        tpoPremiumAmount: loanAmount * 0.005,
        totalRevenue: loanAmount * 0.02,
        commission: loanAmount * 0.01,
        stage: stageInfo.dealStage,
      }).returning();

      // Create project for users past the initial application stage
      const shouldHaveProject = ![
        "registered_only", "started_app_10", "started_app_50", "duplicate_test"
      ].includes(stage.key);

      if (shouldHaveProject) {
        const projectNumber = `SPX-${new Date().getFullYear()}-${String(1000 + i).padStart(4, "0")}`;
        
        const [project] = await db.insert(projects).values({
          userId: newUser.id,
          quoteId: quote.id,
          projectName: `${firstName} ${lastName} - ${propertyAddress.split(",")[0]}`,
          projectNumber,
          loanAmount,
          interestRate: parseFloat(interestRate),
          loanTermMonths: faker.helpers.arrayElement([12, 18, 24, 36]),
          loanType: loanData.loanProductType === "dscr" ? "DSCR" : loanData.loanType,
          propertyAddress,
          propertyType: loanData.propertyType,
          borrowerName: `${firstName} ${lastName}`,
          borrowerEmail: email,
          borrowerPhone: faker.phone.number(),
          status: stageInfo.projectStatus,
          currentStage: stageInfo.currentStage,
          progressPercentage: stageInfo.progress,
          applicationDate: faker.date.past({ years: 0.5 }),
          targetCloseDate: faker.date.future({ years: 0.25 }),
          borrowerPortalToken: faker.string.alphanumeric(32),
          borrowerPortalEnabled: true,
          notes: `Test borrower at stage: ${stage.description}`,
        }).returning();

        // Create project stages
        const currentStageOrder = PROJECT_STAGES_TEMPLATE.findIndex(s => s.stageKey === stageInfo.currentStage) + 1;
        
        for (const stageTemplate of PROJECT_STAGES_TEMPLATE) {
          let stageStatus = "pending";
          let startedAt = null;
          let completedAt = null;

          if (stageTemplate.stageOrder < currentStageOrder) {
            stageStatus = "completed";
            startedAt = faker.date.past({ years: 0.25 });
            completedAt = faker.date.past({ years: 0.1 });
          } else if (stageTemplate.stageOrder === currentStageOrder) {
            stageStatus = "in_progress";
            startedAt = faker.date.recent({ days: 14 });
          }

          const [projectStage] = await db.insert(projectStages).values({
            projectId: project.id,
            stageName: stageTemplate.stageName,
            stageKey: stageTemplate.stageKey,
            stageOrder: stageTemplate.stageOrder,
            status: stageStatus,
            startedAt,
            completedAt,
            visibleToBorrower: true,
          }).returning();

          // Add some tasks to current and completed stages
          if (stageStatus === "in_progress" || stageStatus === "completed") {
            const taskCount = faker.number.int({ min: 2, max: 5 });
            for (let t = 0; t < taskCount; t++) {
              const taskCompleted = stageStatus === "completed" || faker.datatype.boolean();
              await db.insert(projectTasks).values({
                projectId: project.id,
                stageId: projectStage.id,
                taskTitle: faker.helpers.arrayElement([
                  "Upload income verification",
                  "Sign disclosure documents",
                  "Submit bank statements",
                  "Property inspection scheduled",
                  "Title search ordered",
                  "Appraisal ordered",
                  "Insurance binder received",
                  "Final walkthrough scheduled",
                  "Wire instructions confirmed",
                ]),
                taskDescription: faker.lorem.sentence(),
                taskType: faker.helpers.arrayElement(["document_upload", "review", "approval", "scheduling"]),
                status: taskCompleted ? "completed" : faker.helpers.arrayElement(["pending", "in_progress"]),
                priority: faker.helpers.arrayElement(["low", "medium", "high"]),
                visibleToBorrower: true,
                borrowerActionRequired: !taskCompleted && faker.datatype.boolean(),
                completedAt: taskCompleted ? faker.date.recent({ days: 7 }) : null,
              });
            }
          }
        }
      }
    }
  }

  console.log("\n✅ Seed complete!");
  console.log(`Created ${createdUsers.length} test borrowers with:`);
  console.log(`  - Saved quotes/deals for ${createdUsers.filter(u => u.stage.key !== "registered_only").length} users`);
  console.log(`  - Projects with stages and tasks for qualifying users`);
  console.log("\n📋 Login credentials for all test users:");
  console.log("   Email pattern: test.borrower.N@sphinxtest.com (where N is 1-20)");
  console.log("   Password: TestPass123!");
  console.log("\n🔑 Example logins:");
  createdUsers.slice(0, 5).forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.user.email} - ${item.stage.description}`);
  });
}

// Run the seeder
seedTestBorrowers(20)
  .then(() => {
    console.log("\n🎉 Seeding completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Seeding failed:", err);
    process.exit(1);
  });
