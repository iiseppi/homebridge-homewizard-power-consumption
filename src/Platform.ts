import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import axios from 'axios';
import { HomewizardPowerConsumptionAccessory } from './PlatformTypes';
import PowerConsumption from './Accessories/PowerConsumption';
import PowerReturn from './Accessories/PowerReturn';

export class HomewizardPowerConsumption implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly heartBeatInterval = 5 * 1000; // every minute
  private devices: HomewizardPowerConsumptionAccessory[] = [];


  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.api.on('didFinishLaunching', () => {
      this.initialise();
    });
  }

  public configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  private validateConfig(): boolean {
    return !!this.config.ip;
  }

  private async initialise() {
    if (!this.validateConfig()) {
      this.log.warn('Please provide P1\'s IP address');
      return;
    }

    this.setupAccessoires();

    await this.heartBeat();

    setInterval(() => {
      this.heartBeat();
    }, this.heartBeatInterval);
  }

  private setupAccessoires() {
    const powerConsumptionUuid = this.api.hap.uuid.generate('homewizard-power-consumption');
    const powerConsumptionExsistingAccessory = this.accessories.find(accessory => accessory.UUID === powerConsumptionUuid);
    if (powerConsumptionExsistingAccessory) {
      this.devices.push(new PowerConsumption(this.config, this.log, this.api, powerConsumptionExsistingAccessory));
    } else {
      this.log.info('Power Consumption added as accessory');
      const accessory = new this.api.platformAccessory('Power Consumption', powerConsumptionUuid);
      this.devices.push(new PowerConsumption(this.config, this.log, this.api, accessory));
      this.api.registerPlatformAccessories('homebridge-homewizard-power-consumption', 'HomewizardPowerConsumption', [accessory]);
    }


    const powerReturnUuid = this.api.hap.uuid.generate('homewizard-power-return');
    const powerReturnExsistingAccessory = this.accessories.find(accessory => accessory.UUID === powerReturnUuid);
    if (powerReturnExsistingAccessory) {
      this.devices.push(new PowerReturn(this.config, this.log, this.api, powerReturnExsistingAccessory));
    } else {
      this.log.info('Power Return added as accessory');
      const accessory = new this.api.platformAccessory('Power Return', powerReturnUuid);
      this.devices.push(new PowerReturn(this.config, this.log, this.api, accessory));
      this.api.registerPlatformAccessories('homebridge-homewizard-power-consumption', 'HomewizardPowerConsumption', [accessory]);
    }
  }

  private async heartBeat() {
    const { data } = await axios.get(`http://${this.config.ip}/api/v1/data`);
    const consumption = data.active_power_w as number;

    this.devices.forEach((device: HomewizardPowerConsumptionAccessory) => {
      device.beat(consumption);
    });
  }
}
