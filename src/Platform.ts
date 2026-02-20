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
  private targetIp: string = '';
  private deviceData: any; // Lisätty laitetietojen tallennus

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

  private async initialise() {
    this.targetIp = this.config.ip || (this.config.devices && this.config.devices[0] && this.config.devices[0].ip);

    if (!this.targetIp) {
      this.log.error('IP-osoite puuttuu asetuksista!');
      return;
    }

    try {
      // 1. Haetaan ensin laitteen metatiedot (tämä korjaa TSC virheen)
      this.log.info(`Haetaan laitetiedot osoitteesta: http://${this.targetIp}/api`);
      const metaResponse = await axios.get(`http://${this.targetIp}/api`, { timeout: 5000 });
      this.deviceData = metaResponse.data;

      // 2. Testataan vielä, että data-osoite vastaa
      this.log.info(`Varmistetaan yhteys data-rajapintaan...`);
      await axios.get(`http://${this.targetIp}/api/v1/data`, { timeout: 5000 });
      
      this.log.info('Yhteys kunnossa! Luodaan laitteet.');
      this.setupAccessories();
      
      // 3. Käynnistetään päivitykset
      await this.heartBeat();
      setInterval(() => this.heartBeat(), this.heartBeatInterval);
      
    } catch (error) {
      this.log.error(`Yhteys epäonnistui osoitteeseen http://${this.targetIp}. Varmista IP ja Local API.`);
    }
  }

  private setupAccessories() {
    const consumptionUuid = this.api.hap.uuid.generate('homewizard-power-consumption');
    const existingConsumption = this.accessories.find(acc => acc.UUID === consumptionUuid);
    
    if (!this.config.hidePowerConsumptionDevice) {
      const accessory = existingConsumption || new this.api.platformAccessory('Power Consumption', consumptionUuid);
      // Nyt annetaan oikeat laitetiedot (this.deviceData) tyhjän {} sijasta
      this.devices.push(new PowerConsumption(this.config, this.log, this.api, accessory, this.deviceData));
      if (!existingConsumption) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    const returnUuid = this.api.hap.uuid.generate('homewizard-power-return');
    const existingReturn = this.accessories.find(acc => acc.UUID === returnUuid);
    
    if (!this.config.hidePowerReturnDevice) {
      const accessory = existingReturn || new this.api.platformAccessory('Power Return', returnUuid);
      // Sama täällä
      this.devices.push(new PowerReturn(this.config, this.log, this.api, accessory, this.deviceData));
      if (!existingReturn) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private async heartBeat() {
    const url = `http://${this.targetIp}/api/v1/data`;
    try {
      const { data } = await axios.get(url);
      this.devices.forEach(d => d.beat(data));
    } catch (e) {
      this.log.error(`Sähkölukemien haku epäonnistui osoitteesta: ${url}`);
    }
  }
}
