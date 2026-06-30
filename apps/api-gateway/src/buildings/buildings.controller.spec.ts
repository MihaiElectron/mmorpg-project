import { Test, TestingModule } from "@nestjs/testing";
import { BuildingsController } from "./buildings.controller";
import { BuildingsService } from "./buildings.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

function makeStation(id = "building-uuid-1") {
  return {
    kind: "entity",
    category: "building",
    id,
    type: "AUCTION_HOUSE",
    mapId: 1,
    position: { worldX: 1024, worldY: 2048 },
    state: "ACTIVE",
    capabilities: ["placement", "persistence", "validation", "interaction", "auction_house"],
    metadata: {
      templateId: "tpl-uuid-1",
      templateKey: "auction_house",
      name: "Hotel des Ventes",
      buildingType: "AUCTION_HOUSE",
      textureKey: null,
      interactionRadiusWU: 2048,
      templateEnabled: true,
    },
  };
}

describe("BuildingsController", () => {
  let controller: BuildingsController;
  let buildingsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    buildingsService = {
      getBuildingWorldObjects: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BuildingsController],
      providers: [
        { provide: BuildingsService, useValue: buildingsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BuildingsController>(BuildingsController);
  });

  it("world-objects retourne les buildings sans filtre mapId", async () => {
    const building = makeStation();
    buildingsService.getBuildingWorldObjects.mockResolvedValue([building]);

    const result = await controller.getWorldObjects(undefined);

    expect(buildingsService.getBuildingWorldObjects).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([building]);
  });

  it("world-objects convertit mapId string en number", async () => {
    buildingsService.getBuildingWorldObjects.mockResolvedValue([]);

    await controller.getWorldObjects("1");

    expect(buildingsService.getBuildingWorldObjects).toHaveBeenCalledWith(1);
  });

  it("world-objects retourne un tableau vide si aucun building", async () => {
    buildingsService.getBuildingWorldObjects.mockResolvedValue([]);

    const result = await controller.getWorldObjects(undefined);

    expect(result).toEqual([]);
  });
});
