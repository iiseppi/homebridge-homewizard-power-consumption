import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import axios from 'axios';
import { HomewizardPowerConsumptionAccessory, HomewizardDevice } from './PlatformTypes';
import PowerConsumption from './Accessories/PowerConsumption';
import PowerReturn from './Accessories/PowerReturn';

export class HomewizardPowerConsumption implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private heartBeatInterval: number;
  private devices: HomewizardPowerConsumptionAccessory[] = [];
  private device: HomewizardDevice;


  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.heartBeatInterval = (config.pollInterval || 60) * 1000;
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

  private async validateIp(): Promise<boolean> {
    try {
      const { data } = await axios.get(`http://${this.config.ip}/api/`, { timeout: 2000 });
      if (data && data.product_type === 'HWE-P1') {
        this.device = data;
        return true;
      }
      return false;
    } catch(error) {
      return false;
    }
  }

  private async initialise() {
    if (!this.validateConfig()) {
      this.log.error('Configuration error. Please provide your Wi-Fi P1 meter\'s IP address');
      return;
    }

    if (!await this.validateIp()) {
      this.log.error('Your Wi-Fi P1 meter\'s IP address seems to be incorrect. No connection possible');
      return;
    }

    this.setupAccessoires();

    await this.heartBeat();

    setInterval(() => {
      this.heartBeat();
    }, this.heartBeatInterval);
  }

  private setupAccessoires() {

    const powerConsumptionName = 'Power Consumption';
    const powerConsumptionUuid = this.api.hap.uuid.generate('homewizard-power-consumption');
    const powerConsumptionExistingAccessory = this.accessories.find(accessory => accessory.UUID === powerConsumptionUuid);
    if (this.config.hidePowerConsumptionDevice !== true) {
      if (powerConsumptionExistingAccessory) {
        this.devices.push(new PowerConsumption(this.config, this.log, this.api, powerConsumptionExistingAccessory, this.device));
      } else {
        this.log.info(`${powerConsumptionName} added as accessory`);
        const accessory = new this.api.platformAccessory(powerConsumptionName, powerConsumptionUuid);
        this.devices.push(new PowerConsumption(this.config, this.log, this.api, accessory, this.device));
        this.api.registerPlatformAccessories('homebridge-homewizard-power-consumption', 'HomewizardPowerConsumption', [accessory]);
      }
    } else {
      if (powerConsumptionExistingAccessory) {
        this.api.unregisterPlatformAccessories(powerConsumptionUuid, 'homebridge-homewizard-power-consumption', [powerConsumptionExistingAccessory]);
      }
    }

    const powerReturnName = 'Power Return';
    const powerReturnUuid = this.api.hap.uuid.generate('homewizard-power-return');
    const powerReturnExistingAccessory = this.accessories.find(accessory => accessory.UUID === powerReturnUuid);
    if (this.config.hidePowerReturnDevice !== true) {
      if (powerReturnExistingAccessory) {
        this.devices.push(new PowerReturn(this.config, this.log, this.api, powerReturnExistingAccessory, this.device));
      } else {
        this.log.info(`${powerReturnName} added as accessory`);
        const accessory = new this.api.platformAccessory(powerReturnName, powerReturnUuid);
        this.devices.push(new PowerReturn(this.config, this.log, this.api, accessory, this.device));
        this.api.registerPlatformAccessories('homebridge-homewizard-power-consumption', 'HomewizardPowerConsumption', [accessory]);
      }
    } else {
      if (powerReturnExistingAccessory) {
        this.api.unregisterPlatformAccessories(powerReturnUuid, 'homebridge-homewizard-power-consumption', [powerReturnExistingAccessory]);
      }
    }
  }
  
// Tässä HomeWizard-lisälaitteen luokka
class HomeWizardAccessory {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        // Fakegato-historian alustaminen
        this.loggingService = new FakeGatoHistoryService('energy', this, {
            storage: 'fs',
            path: './fakegatoStorage',
            disableTimer: false
        });

        this.currentPower = 0; // Alkuarvo
        this.totalConsumption = 0; // Alkuarvo

        this.service = new this.api.hap.Service.Switch(this.config.name);
        this.service.addCharacteristic(this.loggingService);

        this.api.on('didFinishLaunching', () => {
            this.updateEnergyData();
        });
    }

    updateEnergyData() {
        // Lisää energiankulutustiedot Fakegatoon
        setInterval(() => {
            this.currentPower = Math.random() * 1000; // Simuloitu kulutus
            this.totalConsumption += this.currentPower / 3600000;

            this.loggingService.addEntry({
                time: Math.round(new Date().valueOf() / 1000),
                power: this.currentPower,
                total: this.totalConsumption
            });

            this.log(`Power: ${this.currentPower} W, Total: ${this.totalConsumption.toFixed(2)} kWh`);
        }, 60000); // 1 min päivitys
    }
}

  
  private async heartBeat() {
    try {
      const { data } = await axios.get(`http://${this.config.ip}/api/v1/data`);
      const consumption = data.active_power_w as number;
      this.devices.forEach((device: HomewizardPowerConsumptionAccessory) => {
        device.beat(consumption);
      });
      this.log.debug('heart beat', consumption);
    } catch(error) {
      this.log.error('Something went wrong, please double check the Wi-Fi P1 meter\'s IP address');
      this.log.debug(error);
    }
  }
}
