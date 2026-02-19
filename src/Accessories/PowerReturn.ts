import { Service, PlatformAccessory, PlatformConfig, Logger, API, Characteristic } from 'homebridge';
import { HomewizardDevice, HomewizardPowerConsumptionAccessory } from '../PlatformTypes';
import FakeGatoHistoryService from 'fakegato-history';

export default class PowerReturn implements HomewizardPowerConsumptionAccessory {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  private powerService: Service;
  private historyService: any;

  constructor(
    public config: PlatformConfig,
    public readonly log: Logger,
    public readonly api: API,
    public accessory: PlatformAccessory,
    public device: HomewizardDevice
  ) {
    // Set accessory information
    this.accessory.getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'HomeWizard')
      .setCharacteristic(this.Characteristic.Model, device.product_name || device.product_type)
      .setCharacteristic(this.Characteristic.SerialNumber, `${device.serial}-power-return`);

    // We use LightSensor as a fallback for standard Home App to show Watts (as Lux)
    this.powerService = this.accessory.getService(this.Service.LightSensor) || 
                        this.accessory.addService(this.Service.LightSensor);

    this.powerService.setCharacteristic(this.Characteristic.Name, 'Power Return');

    // Initialize Fakegato History Service for Eve app graphs
    const FakeGatoService = FakeGatoHistoryService(this.api);
    this.historyService = new FakeGatoService('energy', this.accessory, {
      storage: 'fs',
      path: this.api.user.storagePath(),
      filename: `history_return_${this.accessory.UUID}.json`,
    });

    // Add custom Eve Energy characteristics
    this.setupEveCharacteristics();
  }

  private setupEveCharacteristics() {
    // Current Return/Export (Watts) - Eve UUID
    const consumptionUUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
    if (!this.powerService.testCharacteristic(consumptionUUID)) {
      this.powerService.addCharacteristic(new this.api.hap.Characteristic('Consumption', consumptionUUID, {
        format: this.api.hap.Formats.UINT16,
        unit: 'W',
        perms: [this.api.hap.Perms.PAIRED_READ, this.api.hap.Perms.NOTIFY],
      }));
    }

    // Total Export (kWh) - Eve UUID
    const totalConsumptionUUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
    if (!this.powerService.testCharacteristic(totalConsumptionUUID)) {
      this.powerService.addCharacteristic(new this.api.hap.Characteristic('Total Consumption', totalConsumptionUUID, {
        format: this.api.hap.Formats.FLOAT,
        unit: 'kWh',
        perms: [this.api.hap.Perms.PAIRED_READ, this.api.hap.Perms.NOTIFY],
      }));
    }

    // Voltage (Volts) - Eve UUID
    const voltageUUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
    if (!this.powerService.testCharacteristic(voltageUUID)) {
      this.powerService.addCharacteristic(new this.api.hap.Characteristic('Voltage', voltageUUID, {
        format: this.api.hap.Formats.FLOAT,
        unit: 'V',
        perms: [this.api.hap.Perms.PAIRED_READ, this.api.hap.Perms.NOTIFY],
      }));
    }
  }

  /**
   * Called periodically by the platform with fresh data.
   * Maps HomeWizard "Export" data to the sensor.
   */
  public beat(data: any) {
    // In HomeWizard API, active_power_w is negative when exporting power
    const rawPower = data.active_power_w || 0;
    const returnWatts = rawPower < 0 ? Math.abs(rawPower) : 0;
    
    // Use total export field for this accessory
    const totalExportKwh = data.total_power_export_kwh || 0;
    const voltage = data.active_voltage_l1_v || 230;

    const minimumLuxLevel = 0.0001;
    const newPowerLevel = returnWatts > 0 ? returnWatts : minimumLuxLevel;

    // Update standard HomeKit LightSensor
    this.powerService.updateCharacteristic(this.Characteristic.CurrentAmbientLightLevel, newPowerLevel);

    // Update Eve-specific characteristics (using the same UUIDs but with return data)
    this.powerService.updateCharacteristic('Consumption', returnWatts);
    this.powerService.updateCharacteristic('Total Consumption', totalExportKwh);
    this.powerService.updateCharacteristic('Voltage', voltage);

    // Add entry to history log
    this.historyService.addEntry({
      time: Math.round(new Date().getTime() / 1000),
      power: returnWatts,
    });

    this.log.debug(`[Return] ${returnWatts}W, ${totalExportKwh}kWh, ${voltage}V`);
  }
}
