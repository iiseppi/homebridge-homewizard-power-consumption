import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import axios from 'axios';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import PowerConsumption from './Accessories/PowerConsumption';
import PowerReturn from './Accessories/PowerReturn';

export class HomewizardPowerConsumption implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  
  private heartBeatInterval: number;
  private devices: any[] = [];
  private deviceData: any;
  private apiPath = '/api/v1';

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.heartBeatInterval = (config.pollInterval || 10) * 1000;

    this.api.on('didFinishLaunching', () => {
      this.initialise();
    });
  }

  public configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  private async discoverDevice(): Promise<boolean> {
    const ip = this.config.ip;
    try {
      const response = await axios.get(`http://${ip}/api/v2`, { timeout: 3000 });
      this.deviceData = response.data;
      this.apiPath = '/api/v2';
      this.log.info('Using API v2');
      return true;
    } catch (error) {
      try {
        const response = await axios.get(`http://${ip}/api/v1`, { timeout: 3000 });
        this.deviceData = response.data;
        this.apiPath = '/api/v1';
        this.log.info('Using API v1');
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  private async initialise() {
    if (!this.config.ip || !await this.discoverDevice()) {
      this.log.error('Connection failed to HomeWizard device.');
      return;
    }
    this.setupAccessories();
    await this.heartBeat();
    setInterval(() => this.heartBeat(), this.heartBeatInterval);
  }

  private setupAccessories() {
    const consumptionUuid = this.api.hap.uuid.generate('homewizard-power-consumption');
    const existingConsumption = this.accessories.find(acc => acc.UUID === consumptionUuid);
    if (!this.config.hidePowerConsumptionDevice) {
      const accessory = existingConsumption || new this.api.platformAccessory('Power Consumption', consumptionUuid);
      this.devices.push(new PowerConsumption(this.config, this.log, this.api, accessory, this.deviceData));
      if (!existingConsumption) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    const returnUuid = this.api.hap.uuid.generate('homewizard-power-return');
    const existingReturn = this.accessories.find(acc => acc.UUID === returnUuid);
    if (!this.config.hidePowerReturnDevice) {
      const accessory = existingReturn || new this.api.platformAccessory('Power Return', returnUuid);
      this.devices.push(new PowerReturn(this.config, this.log, this.api, accessory, this.deviceData));
      if (!existingReturn) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private async heartBeat() {
    try {
      const { data } = await axios.get(`http://${this.config.ip}${this.apiPath}/data`);
      this.devices.forEach(d => d.beat(data));
    } catch (e) {
      this.log.error('Heartbeat failed');
    }
  }
}
