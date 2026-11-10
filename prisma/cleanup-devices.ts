import { prisma } from "../src/lib/db";

async function main() {
  // 1. Delete simulated devices (any device that is not the real Pi RPI-F985A91710483C30)
  const delDev = await prisma.device.deleteMany({
    where: { serialNumber: { not: "RPI-F985A91710483C30" } },
  });
  console.log("Deleted fake devices:", delDev.count);

  // 2. Delete simulated discovered devices
  const delDisc = await prisma.discoveredDevice.deleteMany({
    where: { serialNumber: { not: "RPI-F985A91710483C30" } },
  });
  console.log("Deleted fake discovered devices:", delDisc.count);

  // 3. Update the authentic physical Raspberry Pi device
  const pi = await prisma.device.update({
    where: { serialNumber: "RPI-F985A91710483C30" },
    data: {
      ipAddress: "192.168.1.8",
      gatewayIp: "192.168.1.1",
      gatewayStatus: "REACHABLE",
      macAddress: "fe80::5c39:b23:b07f:c04e%eth0",
      agentVersion: "1.0.0",
      lastSeenAt: new Date(),
      config: JSON.stringify({
        ssh: {
          host: "192.168.1.8",
          port: 22,
          username: "farlink",
        },
      }),
    },
  });
  console.log("Updated authentic Pi:", pi.name, "IP:", pi.ipAddress, "Gateway:", pi.gatewayIp, "Status:", pi.gatewayStatus, "LastSeen:", pi.lastSeenAt);

  // Mark discovered as registered
  await prisma.discoveredDevice.updateMany({
    where: { serialNumber: "RPI-F985A91710483C30" },
    data: { isRegistered: true, ipAddress: "192.168.1.8", lastSeenAt: new Date() },
  });

  const remainingDevices = await prisma.device.findMany();
  console.log("Remaining devices count:", remainingDevices.length);
}

main().catch(console.error);
