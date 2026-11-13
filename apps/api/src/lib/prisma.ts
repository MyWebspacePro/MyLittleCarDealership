import { PrismaClient } from "@prisma/client";

// Eine Instanz pro Prozess. Bei jedem Import neu anzulegen wuerde in Tests und
// in der Watch-Pipeline unzaehlige Verbindungspools aufmachen.
export const prisma = new PrismaClient();