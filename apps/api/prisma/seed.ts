import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { OrgUnitService } from '../src/modules/directory/application/org-unit.service';
import { EmployeeService } from '../src/modules/directory/application/employee.service';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';

const prisma = new PrismaClient();
// OrgUnitService/EmployeeService cuma memakai query standar (create, findMany,
// dst) lewat PrismaService — tidak pernah memanggil onModuleInit/onModuleDestroy
// milik NestJS. Cast ini aman di konteks seed script yang berjalan di luar
// container DI Nest.
const prismaForServices = prisma as unknown as PrismaService;

/** Nama-nama yang masuk akal untuk konteksnya — bukan "Jane Doe" atau "Acme Corp". */
const CUSTOMERS = [
  'PT Sinar Jaya Abadi',
  'CV Terang Benderang',
  'Andi Wijaya',
  'PT Nusantara Digital',
  'Maya Kusuma',
];

const PRODUCTS = [
  { sku: 'ELK-LP14', name: 'Laptop Pro 14"', category: 'Elektronik', price: 24_500_000n, cost: 14_000_000n },
  { sku: 'ELK-MN27', name: 'Monitor 27" 4K', category: 'Elektronik', price: 5_200_000n, cost: 3_100_000n },
  { sku: 'AKS-MSW1', name: 'Mouse Wireless', category: 'Aksesori', price: 1_250_000n, cost: 800_000n },
  { sku: 'AKS-KBM1', name: 'Keyboard Mekanik', category: 'Aksesori', price: 1_800_000n, cost: 1_020_000n },
  { sku: 'SRV-RK42', name: 'Server Rack 42U', category: 'Infrastruktur', price: 78_000_000n, cost: 45_900_000n },
];

const INVESTORS = [
  { code: 'INV-001', name: 'PT Maju Investama' },
  { code: 'INV-002', name: 'Budi Santoso' },
  { code: 'INV-003', name: 'CV Berkah Abadi' },
  { code: 'INV-004', name: 'Siti Rahmawati' },
];

const PERMISSIONS = [
  'transaction:create',
  'transaction:read',
  'profit_rule:create',
  'profit_rule:read',
  // 'distribution:read:all' = visibilitas LINTAS investor (rantai penuh, semua
  // penerima). Investor tidak pernah mendapat izin ini — mereka dilayani lewat
  // rute investors/me/* yang menyaring datanya sendiri di server.
  'distribution:read:all',
  'distribution:approve',
  // Membalik distribusi yang SUDAH cair adalah tindakan lebih berat daripada
  // menyetujui — sengaja permission terpisah dari distribution:approve.
  'distribution:reverse',
  'investor:read:any',
  'payout:manage',
  'employee:manage',
  'org_unit:manage',
  // Kelola produk & pelanggan — bukan cuma admin_keuangan, ops_penjualan juga
  // butuh ini (lihat catatan di ROLES di bawah).
  'catalog:manage',
  'settings:manage',
  'audit:read',
];

const ROLES: Record<string, string[]> = {
  admin_keuangan: PERMISSIONS,
  // Persona ux-spec.md eksplisit: "Input transaksi, kelola produk & pelanggan"
  // — makanya catalog:manage ikut di sini, bukan cuma transaction:*. Status
  // "Bagi" per transaksi tetap kelihatan di /transaksi karena itu ikut
  // transaction:read (embedded di endpoint transaksi sendiri), BUKAN dari
  // distribution:read:all — jadi melepas izin itu tidak menghilangkan
  // informasi yang mereka memang butuh lihat. Dashboard finansial perusahaan
  // dan rincian per-investor tetap bukan urusan peran ini.
  ops_penjualan: ['transaction:create', 'transaction:read', 'catalog:manage'],
  admin_direktori: ['employee:manage', 'org_unit:manage'],
  // Investor tidak dapat permission admin apa pun. Akses mereka datang dari
  // rute investors/me/* yang tidak dipagari @RequirePermission sama sekali —
  // keamanannya dari struktur (ID diturunkan dari token), bukan dari daftar izin.
  investor: [],
};

async function main(): Promise<void> {
  console.log('Menyiapkan data demo…\n');

  // ── Izin & peran ─────────────────────────────────────────────────────────
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, name: key },
    });
  }
  for (const [roleKey, perms] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey.replace(/_/g, ' ') },
    });

    // Seed harus KONVERGEN ke ROLES di atas, bukan cuma menambah. Tanpa
    // pembersihan ini, permission lama yang sudah diganti nama/dihapus dari
    // daftar (mis. 'distribution:read' sebelum diganti 'distribution:read:all')
    // akan menumpuk selamanya di role_permissions setiap kali seed dijalankan
    // ulang — data basi yang tidak pernah disadari sampai diaudit manual.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { key: { notIn: perms.length > 0 ? perms : ['__none__'] } },
      },
    });

    for (const permKey of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key: permKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  // ── Pengguna ─────────────────────────────────────────────────────────────
  const passwordHash = await argon2.hash('demo1234');
  const users = [
    { email: 'admin@contoh.id', displayName: 'Dewi Kartika', role: 'admin_keuangan' },
    { email: 'sales@contoh.id', displayName: 'Rian Pratama', role: 'ops_penjualan' },
    { email: 'hr@contoh.id', displayName: 'Sari Utami', role: 'admin_direktori' },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, displayName: u.displayName, passwordHash },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { key: u.role } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  // ── Katalog ──────────────────────────────────────────────────────────────
  for (const p of PRODUCTS) {
    const found = await prisma.product.findFirst({ where: { sku: p.sku, deletedAt: null } });
    if (!found) {
      await prisma.product.create({
        data: { sku: p.sku, name: p.name, category: p.category, price: p.price, productionCost: p.cost },
      });
    }
  }
  for (const name of CUSTOMERS) {
    const found = await prisma.customer.findFirst({ where: { name, deletedAt: null } });
    if (!found) await prisma.customer.create({ data: { name } });
  }

  const investorRecords = [];
  for (const inv of INVESTORS) {
    investorRecords.push(
      await prisma.investor.upsert({ where: { code: inv.code }, update: {}, create: inv }),
    );
  }
  const [maju, budi, berkah, siti] = investorRecords;

  // ── Akun login untuk investor ────────────────────────────────────────────
  //
  // User (identitas login) sengaja dipisah dari Investor (entitas bisnis
  // penerima bagi hasil) — lihat architecture.md § 7.1. Dua investor dibuatkan
  // akun: satu badan hukum yang muncul di banyak aturan (kasus "kenapa segini"
  // yang paling membingungkan — porsinya datang dari beberapa lapisan
  // sekaligus), satu individu dengan kasus lebih sederhana.
  const investorRole = await prisma.role.findUniqueOrThrow({ where: { key: 'investor' } });
  const investorLogins = [
    { investor: maju, email: 'investor1@contoh.id', displayName: maju.name },
    { investor: budi, email: 'investor2@contoh.id', displayName: budi.name },
  ];
  for (const { investor, email, displayName } of investorLogins) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName, passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: investorRole.id } },
      update: {},
      create: { userId: user.id, roleId: investorRole.id },
    });
    // Tautan User → Investor. Tanpa ini, akun bisa login tapi
    // GET /investors/me akan 404 — "akun tidak tertaut ke profil investor".
    await prisma.investor.update({ where: { id: investor.id }, data: { userId: user.id } });
  }

  // ── Direktori — unit organisasi & karyawan ──────────────────────────────
  //
  // Struktur kecil tapi nyata: satu root (CEO), tiga divisi, dua tim di
  // bawah divisi. employeeNo, closure table, dan reporting line semuanya
  // diisi lewat OrgUnitService/EmployeeService yang sesungguhnya (bukan
  // insert langsung) — supaya seed ini jadi bukti hidup bahwa closure table
  // re-parenting benar-benar bekerja, bukan cuma lulus tes unit.
  const hrUser = await prisma.user.findUniqueOrThrow({ where: { email: 'hr@contoh.id' } });

  const orgUnitService = new OrgUnitService(prismaForServices);
  const employeeService = new EmployeeService(prismaForServices);

  let root = await prisma.orgUnit.findFirst({ where: { code: 'ORG-ROOT', deletedAt: null } });
  if (!root) root = await orgUnitService.create({ name: 'Kantor Pusat', code: 'ORG-ROOT' });

  const divisions: Record<string, string> = {};
  const divisionPlan = [
    { code: 'ORG-KEU', name: 'Divisi Keuangan' },
    { code: 'ORG-SLS', name: 'Divisi Penjualan' },
    { code: 'ORG-OPS', name: 'Divisi Operasional' },
  ];
  for (const d of divisionPlan) {
    let unit = await prisma.orgUnit.findFirst({ where: { code: d.code, deletedAt: null } });
    if (!unit) unit = await orgUnitService.create({ name: d.name, code: d.code, parentId: root.id });
    divisions[d.code] = unit.id;
  }

  let teamBagiHasil = await prisma.orgUnit.findFirst({ where: { code: 'ORG-KEU-BH', deletedAt: null } });
  if (!teamBagiHasil) {
    teamBagiHasil = await orgUnitService.create({
      name: 'Tim Bagi Hasil', code: 'ORG-KEU-BH', parentId: divisions['ORG-KEU'],
    });
  }
  let teamSalesElektronik = await prisma.orgUnit.findFirst({ where: { code: 'ORG-SLS-ELK', deletedAt: null } });
  if (!teamSalesElektronik) {
    teamSalesElektronik = await orgUnitService.create({
      name: 'Tim Sales Elektronik', code: 'ORG-SLS-ELK', parentId: divisions['ORG-SLS'],
    });
  }

  // Karyawan — dua di antaranya bertaut ke akun login yang sudah ada
  // (admin@contoh.id, sales@contoh.id), sisanya murni data HR tanpa akun
  // (kenyataan paling umum: tidak semua karyawan butuh login sistem ini).
  const adminForDirectory = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@contoh.id' } });
  const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@contoh.id' } });

  const existingEmployeeCount = await prisma.employee.count();
  if (existingEmployeeCount === 0) {
    const ceo = await employeeService.create({
      fullName: 'Dewi Kartika', email: 'dewi.kartika@contoh.id', position: 'CEO', orgUnitId: root.id,
    });
    await prisma.employee.update({ where: { id: ceo.id }, data: { userId: adminForDirectory.id } });

    const dirKeu = await employeeService.create({
      fullName: 'Sari Utami', email: 'sari.utami@contoh.id', position: 'Direktur Keuangan',
      orgUnitId: divisions['ORG-KEU'], managerId: ceo.id,
    });
    await prisma.employee.update({ where: { id: dirKeu.id }, data: { userId: hrUser.id } });

    const dirSales = await employeeService.create({
      fullName: 'Rian Pratama', email: 'rian.pratama@contoh.id', position: 'Direktur Penjualan',
      orgUnitId: divisions['ORG-SLS'], managerId: ceo.id,
    });
    await prisma.employee.update({ where: { id: dirSales.id }, data: { userId: salesUser.id } });

    const dirOps = await employeeService.create({
      fullName: 'Joko Hadi', email: 'joko.hadi@contoh.id', position: 'Direktur Operasional',
      orgUnitId: divisions['ORG-OPS'], managerId: ceo.id,
    });

    const staffPlan = [
      { fullName: 'Maya Anggraini', email: 'maya.anggraini@contoh.id', position: 'Staf Bagi Hasil', orgUnitId: teamBagiHasil.id, managerId: dirKeu.id },
      { fullName: 'Fajar Nugroho', email: 'fajar.nugroho@contoh.id', position: 'Staf Bagi Hasil', orgUnitId: teamBagiHasil.id, managerId: dirKeu.id },
      { fullName: 'Putri Wulandari', email: 'putri.wulandari@contoh.id', position: 'Sales Elektronik', orgUnitId: teamSalesElektronik.id, managerId: dirSales.id },
      { fullName: 'Bima Setiawan', email: 'bima.setiawan@contoh.id', position: 'Sales Elektronik', orgUnitId: teamSalesElektronik.id, managerId: dirSales.id },
      { fullName: 'Indah Permata', email: 'indah.permata@contoh.id', position: 'Staf Operasional', orgUnitId: divisions['ORG-OPS'], managerId: dirOps.id },
    ];
    for (const s of staffPlan) await employeeService.create(s);

    // Satu karyawan NONAKTIF dengan sengaja — inilah yang membuat demo
    // langsung membuktikan manfaat inti directory management (lihat
    // ux-spec.md §7.8): status akun harus terlihat menonjol di daftar,
    // bukan tersembunyi, persis kasus "karyawan resign" yang jadi
    // ketakutan utama peran Admin Direktori/HR.
    const alumni = await employeeService.create({
      fullName: 'Rangga Wibowo', email: 'rangga.wibowo@contoh.id', position: 'Mantan Staf Sales',
      orgUnitId: teamSalesElektronik.id, managerId: dirSales.id,
    });
    await employeeService.deactivate(alumni.id);
  }

  // ── Aturan bagi hasil — sengaja dibuat BERLAPIS agar demo menunjukkan
  //    perilaku composable, bukan satu aturan tunggal yang membosankan.
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@contoh.id' } });
  const from = new Date('2026-01-01');

  const rules = [
    {
      name: 'Dasar Semua Produk',
      description: 'Berlaku untuk seluruh transaksi. Porsi dasar bagi seluruh investor inti.',
      productCategory: null,
      executionOrder: 10,
      stackable: true,
      basis: 'RESIDUAL' as const,
      specificity: 0,
      shares: [
        { investorId: maju.id, basisPoints: 1200 },
        { investorId: budi.id, basisPoints: 800 },
      ],
    },
    {
      name: 'Kategori Elektronik',
      description: 'Tambahan untuk produk elektronik, dihitung dari laba awal.',
      productCategory: 'Elektronik',
      executionOrder: 20,
      stackable: true,
      basis: 'GROSS' as const,
      specificity: 4,
      shares: [
        { investorId: maju.id, basisPoints: 1800 },
        { investorId: berkah.id, basisPoints: 1200 },
      ],
    },
    {
      name: 'Laba Besar di Atas Rp 50 Juta',
      description: 'Aturan penutup: transaksi besar memakai skema khusus dan tidak menumpuk lagi.',
      productCategory: null,
      minProfit: 50_000_000n,
      executionOrder: 5,
      stackable: false,
      basis: 'GROSS' as const,
      specificity: 2,
      shares: [
        { investorId: maju.id, basisPoints: 2000 },
        { investorId: siti.id, basisPoints: 1500 },
      ],
    },
  ];

  for (const r of rules) {
    const exists = await prisma.profitSharingRule.findFirst({ where: { name: r.name, deletedAt: null } });
    if (exists) continue;
    await prisma.profitSharingRule.create({
      data: {
        name: r.name,
        description: r.description,
        productCategory: r.productCategory,
        minProfit: r.minProfit ?? null,
        validFrom: from,
        executionOrder: r.executionOrder,
        stackable: r.stackable,
        basis: r.basis,
        specificity: r.specificity,
        status: 'ACTIVE',
        createdBy: admin.id,
        shares: { create: r.shares },
      },
    });
  }

  await prisma.setting.upsert({
    where: { key: 'approval_threshold' },
    update: {},
    create: { key: 'approval_threshold', value: '5000000' },
  });

  // ── Transaksi contoh ─────────────────────────────────────────────────────
  const allProducts = await prisma.product.findMany({ where: { deletedAt: null } });
  const allCustomers = await prisma.customer.findMany({ where: { deletedAt: null } });
  const existingTrx = await prisma.transaction.count();

  if (existingTrx === 0) {
    const plan = [
      { sku: 'ELK-LP14', qty: 1 },
      { sku: 'AKS-MSW1', qty: 3 },
      { sku: 'ELK-MN27', qty: 2 },
      { sku: 'SRV-RK42', qty: 2 }, // laba Rp 64,2 jt — melewati ambang, memicu aturan penutup
      { sku: 'AKS-KBM1', qty: 5 },
    ];

    for (const [i, item] of plan.entries()) {
      const product = allProducts.find((p) => p.sku === item.sku)!;
      const customer = allCustomers[i % allCustomers.length];
      const qty = BigInt(item.qty);
      const revenue = product.price * qty;
      const cost = product.productionCost * qty;

      await prisma.transaction.create({
        data: {
          code: `TRX-2026-${String(i + 1).padStart(4, '0')}`,
          productId: product.id,
          customerId: customer.id,
          quantity: item.qty,
          unitPrice: product.price,
          unitProductionCost: product.productionCost,
          revenue,
          productionCostTotal: cost,
          netProfit: revenue - cost,
          status: 'DRAFT',
        },
      });
    }
  }

  const counts = {
    produk: await prisma.product.count({ where: { deletedAt: null } }),
    pelanggan: await prisma.customer.count({ where: { deletedAt: null } }),
    investor: await prisma.investor.count(),
    aturan: await prisma.profitSharingRule.count({ where: { deletedAt: null } }),
    transaksi: await prisma.transaction.count(),
  };

  console.log('Selesai', counts);
  console.log('\nAkun demo');
  console.log('  admin@contoh.id     / demo1234   (admin keuangan, semua izin) → /dashboard');
  console.log('  sales@contoh.id     / demo1234   (ops penjualan, cuma transaksi) → /transaksi');
  console.log('  hr@contoh.id        / demo1234   (admin direktori, karyawan & unit) → /direktori');
  console.log('  investor1@contoh.id / demo1234   (PT Maju Investama, muncul di banyak aturan) → /portal');
  console.log('  investor2@contoh.id / demo1234   (Budi Santoso, kasus lebih sederhana) → /portal');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
