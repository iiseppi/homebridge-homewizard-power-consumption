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
  private targetIp = ''; // Lisätty IP-osoitteen tallennus

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
    // Haetaan IP joko suoraan tai devices-listasta
    this.targetIp = this.config.ip || (this.config.devices && this.config.devices[0] && this.config.devices[0].ip);
    
    if (!this.targetIp) {
      this.log.error('IP-osoitetta ei ole määritetty config.json tiedostossa!');
      return false;
    }

    try {
      // Kokeillaan ensin v2
      const response = await axios.get(`http://${this.targetIp}/api/v2`, { timeout: 3000 });
      this.deviceData = response.data;
      this.apiPath = '/api/v2';
      this.log.info('Löytyi HomeWizard API v2 osoitteesta: ' + this.targetIp);
      return true;
    } catch (error) {
      try {
        // Kokeillaan v1 (huom! v1, ei vl)
        const response = await axios.get(`http://${this.targetIp}/api/v1`, { timeout: 3000 });
        this.deviceData = response.data;
        this.apiPath = '/api/v1';
        this.log.info('Löytyi HomeWizard API v1 osoitteesta: ' + this.targetIp);
        return true;
      } catch (err) {
        this.log.error('Yhteys epäonnistui osoitteeseen: http://' + this.targetIp + '/api/v1');
        return false;
      }
    }
  }

  private async initialise() {
    if (!await this.discoverDevice()) {
      this.log.error('Laitetta ei löytynyt. Varmista IP-osoite ja Local API -asetus.');
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
      // Käytetään varmistettua targetIp:tä ja apiPathia
      const { data } = await axios.get(`http://${this.targetIp}${this.apiPath}/data`);
      this.devices.forEach(d => d.beat(data));
    } catch (e) {
      this.log.error('Päivitys (Heartbeat) epäonnistui');
    }
  }
}
