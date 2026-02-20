import { Service, PlatformAccessory, PlatformConfig, Logger, API, Characteristic } from 'homebridge';
import { HomewizardDevice, HomewizardPowerConsumptionAccessory } from '../PlatformTypes';
import FakeGatoHistoryService from 'fakegato-history';

export default class PowerReturn implements HomewizardPowerConsumptionAccessory {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private powerService: Service;
  private historyService: any;

  constructor(
    public config: PlatformConfig,
    public readonly log: Logger,
    public readonly api: API,
    public accessory: PlatformAccessory,
    public device: HomewizardDevice
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // Asetetaan laitteen tiedot (huom: serial-return erottamaan kulutuksesta)
    this.accessory.getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'HomeWizard')
      .setCharacteristic(this.Characteristic.Model, device.product_name || 'P1 Meter')
      .setCharacteristic(this.Characteristic.SerialNumber, `${device.serial}-return`);

    // Käytetään LightSensor-palvelua näyttämään takaisinsyöttö (lux = W)
    this.powerService = this.accessory.getService(this.Service.LightSensor) || 
                        this.accessory.addService(this.Service.LightSensor);
    
    this.powerService.setCharacteristic(this.Characteristic.Name, 'Power Return');

    // Alustetaan Fakegato History
    const FakeGatoService = FakeGatoHistoryService(this.api);
    this.historyService = new FakeGatoService('energy', this.accessory, {
      storage: 'fs',
      path: this.api.user.storagePath(),
      filename: `history_return_${this.accessory.UUID}.json`,
    });
  }

  public beat(data: any) {
    // HomeWizard API:ssa negatiivinen active_power_w tarkoittaa vientiä verkkoon
    const rawPower = data.active_power_w || 0;
    const returnWatts = rawPower < 0 ? Math.abs(rawPower) : 0;
    const totalExportKwh = data.total_power_export_kwh || 0;

    // Päivitetään "valoisuus" Apple Kotiin
    this.powerService.updateCharacteristic(this.Characteristic.CurrentAmbientLightLevel, Math.max(0.0001, returnWatts));

    // Tallennetaan tieto historiaan (lisätty energy-kenttä)
    if (this.historyService) {
      this.historyService.addEntry({
        time: Math.round(new Date().getTime() / 1000),
        power: returnWatts,
        energy: totalExportKwh // Tämä on tärkeä lisäys graafia varten
      });
    }

    this.log.debug(`[Return Beat] ${returnWatts} W, Total Export: ${totalExportKwh} kWh`);
  }
}
