import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting ABC Bank Seeding with 10 Devices & 24h Telemetry...");

  // 1. Upsert Company: ABC Bank
  const company = await prisma.company.upsert({
    where: { name: "ABC Bank" },
    update: {
      address: "SCBD Lot 28, Jl. Jend. Sudirman Kav 52-53, Jakarta Selatan",
      contact: "it-noc@abcbank.co.id (+62 21 555-8900)",
      isActive: true,
    },
    create: {
      name: "ABC Bank",
      address: "SCBD Lot 28, Jl. Jend. Sudirman Kav 52-53, Jakarta Selatan",
      contact: "it-noc@abcbank.co.id (+62 21 555-8900)",
      isActive: true,
    },
  });
  console.log(`✔ Company verified: ${company.name} (ID: ${company.id})`);

  // 2. Upsert Dedicated Customer User for ABC Bank
  const customerEmail = "operator@abcbank.com";
  const user = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {
      companyId: company.id,
      role: "OPERATOR",
    },
    create: {
      name: "IT Operation ABC Bank",
      email: customerEmail,
      passwordHash: await bcrypt.hash("abcbank123", 12),
      role: "OPERATOR",
      companyId: company.id,
      mustChangePassword: false,
    },
  });
  console.log(`✔ Customer User verified: ${user.email} (Role: ${user.role}, Company: ABC Bank)`);

  // 3. Clear existing ABC Bank devices and test results to ensure clean pristine data
  const existingDevs = await prisma.device.findMany({ where: { companyId: company.id } });
  for (const d of existingDevs) {
    await prisma.testResult.deleteMany({ where: { deviceId: d.id } });
    await prisma.deviceCommand.deleteMany({ where: { deviceId: d.id } });
    await prisma.device.delete({ where: { id: d.id } });
  }

  // 4. Create 10 Devices for ABC Bank
  const deviceConfigs = [
    {
      num: 1,
      name: "ABC-001 (HQ Core Gateway)",
      serial: "FL-ABC-HQ001",
      ip: "10.10.1.1",
      type: "FARLINK_EDGE",
      isInactiveAllTime: true,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 2,
      name: "ABC-002 (Branch Thamrin)",
      serial: "FL-ABC-BR002",
      ip: "10.10.2.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: true, // Bandwidth degradation between 3 to 5 pm (15:00 - 17:00)
      hasDnsIssue: false,
    },
    {
      num: 3,
      name: "ABC-003 (ATM Center Sudirman)",
      serial: "FL-ABC-ATM003",
      ip: "10.10.3.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: true, // DNS missing / resolution failed most of the time
    },
    {
      num: 4,
      name: "ABC-004 (Branch Gatot Subroto)",
      serial: "FL-ABC-BR004",
      ip: "10.10.4.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 5,
      name: "ABC-005 (Branch Kelapa Gading)",
      serial: "FL-ABC-BR005",
      ip: "10.10.5.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 6,
      name: "ABC-006 (ATM Grand Indonesia)",
      serial: "FL-ABC-ATM006",
      ip: "10.10.6.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 7,
      name: "ABC-007 (Branch Kuningan)",
      serial: "FL-ABC-BR007",
      ip: "10.10.7.1",
      type: "FARLINK_EDGE",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 8,
      name: "ABC-008 (Branch TB Simatupang)",
      serial: "FL-ABC-BR008",
      ip: "10.10.8.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 9,
      name: "ABC-009 (ATM Senayan City)",
      serial: "FL-ABC-ATM009",
      ip: "10.10.9.1",
      type: "FARLINK_GO",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
    {
      num: 10,
      name: "ABC-010 (Data Center Backup Probe)",
      serial: "FL-ABC-DC010",
      ip: "10.10.10.1",
      type: "FARLINK_EDGE",
      isInactiveAllTime: false,
      hasDegradation: false,
      hasDnsIssue: false,
    },
  ];

  const now = new Date();
  let totalCreatedResults = 0;

  for (const cfg of deviceConfigs) {
    const isInactive = cfg.isInactiveAllTime;
    const lastSeenAt = isInactive
      ? new Date(now.getTime() - 32 * 3600_000) // 32 hours ago (completely offline)
      : new Date(now.getTime() - Math.floor(Math.random() * 120_000)); // 0-2 mins ago

    const dev = await prisma.device.create({
      data: {
        name: cfg.name,
        serialNumber: cfg.serial,
        type: cfg.type,
        companyId: company.id,
        ipAddress: cfg.ip,
        macAddress: `00:1A:2B:3C:4D:${cfg.num.toString(16).padStart(2, "0").toUpperCase()}`,
        firmwareVersion: "v1.4.2-cm5",
        agentVersion: "2.1.0",
        lastSeenAt,
        gatewayIp: "10.10.0.1",
        gatewayStatus: isInactive ? "UNREACHABLE" : "REACHABLE",
        gatewayLatency: isInactive ? null : 1.2,
        gatewayCheckedAt: lastSeenAt,
        internetStatus: isInactive ? "OFFLINE" : "ONLINE",
        scheduleEnabled: !isInactive,
        scheduleInterval: 15,
        lastScheduledAt: isInactive ? null : new Date(now.getTime() - 15 * 60_000),
        config: JSON.stringify({
          type: cfg.type === "FARLINK_EDGE" ? "FarLink Edge" : "FarLink Go",
          mode: cfg.type === "FARLINK_EDGE" ? "Master" : "Standalone",
          heartbeat_interval: 60,
          speedServer: "",
          mtrTarget: "8.8.8.8",
          digTarget: "google.com",
        }),
      },
    });

    console.log(`  + Device ${cfg.num}/10: ${dev.name} (${dev.serialNumber}) created`);

    // If device is inactive all the time, don't generate test results in 24h
    if (isInactive) {
      continue;
    }

    // Generate 24 hours of 15-minute periodic tests (96 cycles)
    // 24 hours * 4 tests/hour = 96 tests per device
    const testRecords = [];
    const numCycles = 96;

    for (let i = numCycles; i >= 1; i--) {
      const testTime = new Date(now.getTime() - i * 15 * 60_000);
      const testHour = testTime.getHours();

      let status = "SUCCESS";
      let download = 95.0 + (Math.random() * 10 - 5); // baseline ~95 Mbps
      let upload = 48.0 + (Math.random() * 6 - 3);   // baseline ~48 Mbps
      let latency = 12.0 + (Math.random() * 3 - 1.5); // baseline ~12 ms
      let jitter = 1.8 + Math.random() * 0.5;
      let packetLoss = 0.0; // Strictly 0.0% ideal
      let errorMessage: string | null = null;
      let testType = "SPEED";

      // Scenario 2: Device 2 has bandwidth degradation between 3 to 5 pm (15:00 - 17:00)
      if (cfg.hasDegradation && testHour >= 15 && testHour < 17) {
        download = 16.5 + (Math.random() * 4 - 2); // Drops drastically to ~16-18 Mbps (82% drop!)
        upload = 7.2 + (Math.random() * 2 - 1);    // Drops to ~7 Mbps
        latency = 44.5 + Math.random() * 8;        // Latency spikes to ~45 ms
        jitter = 9.4 + Math.random() * 3;
        packetLoss = 0.0; // loss remains 0.0% but throughput severely degraded
      }

      // Scenario 3: Device 3 DNS was missing / resolution failed most of the time
      if (cfg.hasDnsIssue) {
        // 75% fail with DNS missing / resolver timeout
        if (Math.random() < 0.75) {
          status = "FAILED";
          testType = Math.random() < 0.5 ? "DIG" : "SPEED";
          download = 0;
          upload = 0;
          latency = null as any;
          jitter = null as any;
          packetLoss = 0.0;
          errorMessage = "DNS was missing / NXDOMAIN resolution error: upstream resolver 10.10.0.1 timed out (SERVFAIL)";
        } else {
          // occasional success
          download = 88.0 + Math.random() * 10;
          upload = 42.0 + Math.random() * 5;
          latency = 18.0 + Math.random() * 4;
          packetLoss = 0.0;
        }
      }

      testRecords.push({
        deviceId: dev.id,
        testType,
        triggerType: "SCHEDULED",
        status,
        target: "speedtest.net",
        download: status === "SUCCESS" ? +download.toFixed(2) : null,
        upload: status === "SUCCESS" ? +upload.toFixed(2) : null,
        latency: status === "SUCCESS" ? +latency.toFixed(2) : null,
        jitter: status === "SUCCESS" ? +jitter.toFixed(2) : null,
        packetLoss, // Ideal 0.0% packet loss!
        errorMessage,
        startedAt: testTime,
        completedAt: new Date(testTime.getTime() + 18_000),
        duration: 18.0,
      });
    }

    // Insert test records
    await prisma.testResult.createMany({ data: testRecords });
    totalCreatedResults += testRecords.length;
  }

  console.log(`\n🎉 Seed Completed Successfully!`);
  console.log(`Company: ABC Bank (10 Devices)`);
  console.log(`Customer User: ${customerEmail} (password: abcbank123)`);
  console.log(`Total 24h Periodic Tests Created: ${totalCreatedResults} records`);
  console.log(`Scenarios included:`);
  console.log(`  1. ABC-001: Inactive all the time (0 tests, offline)`);
  console.log(`  2. ABC-002: Bandwidth degradation between 3 to 5 pm (15:00 - 17:00, ~17 Mbps vs ~95 Mbps)`);
  console.log(`  3. ABC-003: DNS missing / resolution failed most of the time (NXDOMAIN/SERVFAIL errors)`);
  console.log(`  4. ABC-004 to ABC-010: Normal 15-minute periodic collection with 0.0% packet loss`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
