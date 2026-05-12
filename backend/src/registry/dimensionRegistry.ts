export interface DimensionDefinition {
  column: string;
  aliases: string[];
}

export const DIMENSION_REGISTRY: Record<string, DimensionDefinition> = {
  territory: {
    column: "territory_id",
    aliases: ["territory", "territories", "region", "regions", "market", "area"]
  },
  month: {
    column: "month_id",
    aliases: ["month", "monthly", "time"]
  },
  outlet: {
    column: "outlet_id",
    aliases: ["outlet", "store", "location"]
  },
  employee: {
    column: "employee_id",
    aliases: ["employee", "agent", "rep"]
  },
  device: {
    column: "device_id",
    aliases: ["device", "product", "handset"]
  },
  status: {
    column: "status",
    aliases: ["status", "state"]
  },
  date: {
    column: "date",
    aliases: ["date", "day", "daily"]
  }
};
